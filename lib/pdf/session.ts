import { sessionDisplayConditions } from "@/lib/session-conditions";
import { distanceText } from "../events/programs";
import { netPoints, hitFactor } from "../result-metrics";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFString,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import type { Records, Session } from "@/lib/models";
import { sessionSeriesRatings } from "@/lib/session-medals";
import { seriesConditions } from "@/lib/models";
import { appliedAgeGroups, appliedRuleGroups } from "@/lib/rules/presentation";
import { localizeMessage, translator } from "@/lib/i18n";
import { caliberName, disciplineName, targetName } from "@/lib/i18n-domain";
import design from "@/lib/brand/design.json";
import type { WitnessSignoff } from "@/lib/witness/model";
import { witnessCurrent } from "@/lib/witness/model";

// Assets only: generated PDFs and journal contents are never cached or written to disk.
let assets: Promise<Buffer[]> | undefined;
function loadAssets() {
  return (assets ??= Promise.all([
    readFile(path.join(process.cwd(), "lib/fonts", design.font.file)),
    readFile(path.join(process.cwd(), "public/brand/MyShotLog-logo.svg")).then(
      (bytes) => sharp(bytes).resize({ width: 600 }).png().toBuffer(),
    ),
  ]).catch((error) => {
    assets = undefined;
    throw error;
  }));
}

export async function createSessionPdf(
  data: Records,
  session: Session,
  sessionUrl: string,
) {
  const { tr, language, locale } = translator(data.profile.language);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [fontBytes, logoBytes] = await loadAssets();
  const regular = await doc.embedFont(fontBytes, { subset: true });
  // Didact Gothic has one regular face; use size and colour for print hierarchy.
  const emphasis = regular;
  const logo = await doc.embedPng(logoBytes);
  const qr = await doc.embedPng(
    await QRCode.toBuffer(sessionUrl, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 4,
      width: 300,
    }),
  );
  function colour(value: string) {
    return rgb(
      parseInt(value.slice(1, 3), 16) / 255,
      parseInt(value.slice(3, 5), 16) / 255,
      parseInt(value.slice(5, 7), 16) / 255,
    );
  }
  const ink = colour(design.colours.ink),
    green = colour(design.colours.green),
    muted = colour(design.colours.muted),
    line = colour(design.colours.line);
  const width = 515,
    left = 40,
    bottom = 108;
  let page!: PDFPage,
    y = 752;
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(session.date + "T12:00:00Z"));
  const sharedConditions = sessionDisplayConditions(session);
  const precision = session.discipline === "precision";
  const signoffs = (data.witnessSignoffs ?? []).filter(
    (w) => w.sessionId === session.id,
  );
  function newPage() {
    page = doc.addPage([595.28, 841.89]);
    page.drawImage(logo, {
      x: left,
      y: 783,
      width: 150,
      height: (150 * logo.height) / logo.width,
    });
    page.drawText(tr("print.title"), {
      x: left + width - emphasis.widthOfTextAtSize(tr("print.title"), 16),
      y: 799,
      size: 16,
      font: emphasis,
      color: green,
    });
    page.drawLine({
      start: { x: left, y: 775 },
      end: { x: left + width, y: 775 },
      thickness: 1,
      color: green,
    });
    y = 752;
  }
  function lines(value: string, maxWidth: number, font: PDFFont, size: number) {
    // Break even long unspaced user text; preserve explicit line breaks.
    const output: string[] = [];
    for (const paragraph of value
      .replace(/\r\n?/g, "\n")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
      .split("\n")) {
      let current = "";
      for (const char of paragraph) {
        if (
          current &&
          font.widthOfTextAtSize(current + char, size) > maxWidth
        ) {
          const space = current.lastIndexOf(" ");
          if (space > 0) {
            output.push(current.slice(0, space));
            current = current.slice(space + 1) + char;
          } else {
            output.push(current);
            current = char;
          }
        } else current += char;
      }
      output.push(current);
    }
    return output;
  }
  function ensure(height: number) {
    if (y - height < bottom) newPage();
  }
  function text(
    value: string,
    size = 10,
    font = regular,
    color = ink,
    maxWidth = width,
  ) {
    for (const valueLine of lines(value, maxWidth, font, size)) {
      ensure(size + 3);
      page.drawText(valueLine, { x: left, y, size, font, color });
      y -= size + 3;
    }
  }
  function heading(value: string) {
    ensure(45);
    y -= 10;
    text(value, 13, emphasis, green);
    y -= 4;
  }
  function fieldRow(fields: [string, string][]) {
    const gap = 20;
    const cellWidth = (width - gap * (fields.length - 1)) / fields.length;
    const cells = fields.map(([label, value]) => ({
      labels: lines(label, cellWidth, regular, 8),
      values: lines(value, cellWidth, regular, 10),
    }));
    const labelRows = Math.max(...cells.map((cell) => cell.labels.length));
    const valueRows = Math.max(...cells.map((cell) => cell.values.length));
    ensure(Math.min(labelRows * 11 + valueRows * 13 + 2, 752 - bottom));
    for (let row = 0; row < labelRows + valueRows; row++) {
      const label = row < labelRows;
      const height = label ? 11 : 13;
      ensure(height);
      cells.forEach((cell, column) => {
        const value = label ? cell.labels[row] : cell.values[row - labelRows];
        if (value !== undefined)
          page.drawText(value, {
            x: left + column * (cellWidth + gap),
            y,
            size: label ? 8 : 10,
            font: regular,
            color: label ? muted : ink,
          });
      });
      y -= height;
    }
    y -= 2;
  }
  function conditions(r: Session["results"][number]) {
    return [
      distanceText(r),
      r.seconds != null ? r.seconds + " s" : "",
      r.target ? targetName(language, r.target) : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function headerRow() {
    const cols = [
      tr("details.seriesStage"),
      tr("session.shots"),
      tr("session.points"),
      ...(precision ? [] : [tr("details.hitsFigures")]),
      tr("print.grade"),
    ];
    page.drawRectangle({
      x: left,
      y: y - 12,
      width,
      height: 26,
      color: colour(design.colours.pale),
    });
    (precision
      ? [0, 300, 390, width - 5]
      : [0, 252, 322, 414, width - 5]
    ).forEach((x, i) =>
      page.drawText(cols[i], {
        x:
          i === 0
            ? left + 5
            : left + x - emphasis.widthOfTextAtSize(cols[i], 8),
        y: y - 2,
        size: 8,
        font: emphasis,
        color: green,
      }),
    );
    y -= 32;
  }
  async function renderWitness(w: WitnessSignoff) {
    const current = witnessCurrent(w, session);
    ensure(125);
    const time = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: data.profile.timezone,
    }).format(new Date(w.signedAt));
    text(
      tr("witness.signed", { name: w.name, time }) +
        " (" +
        data.profile.timezone +
        ")",
      11,
      emphasis,
    );
    text(
      w.resultId ? w.snapshot.results[0].label : tr("witness.scopeSession"),
      10,
      emphasis,
    );
    if (!current)
      text(tr("witness.changed"), 9, regular, colour(design.colours.danger));
    // The original attestation is kept in the language actually signed.
    text(w.statement, 9);
    const image = await doc.embedPng(Buffer.from(w.signature.data, "base64"));
    const signature = image.scaleToFit(150, 45);
    ensure(signature.height + 25);
    page.drawImage(image, {
      x: left,
      y: y - signature.height,
      width: signature.width,
      height: signature.height,
    });
    y -= signature.height + 15;
    if (!current) {
      text(tr("print.original"), 9, emphasis);
      text(
        [
          w.snapshot.date,
          w.snapshot.time,
          w.snapshot.location,
          w.snapshot.program,
          disciplineName(language, w.snapshot.discipline),
          w.snapshot.group,
          w.snapshot.context === "practice"
            ? tr("session.practice")
            : tr("session.competition"),
          w.snapshot.firearm
            ? [
                w.snapshot.firearm.make,
                w.snapshot.firearm.model,
                caliberName(language, w.snapshot.firearm.caliber),
              ].join(" · ")
            : tr("common.borrowedFirearm"),
        ]
          .filter(Boolean)
          .join(" · "),
        8,
      );
      for (const r of w.snapshot.results)
        text(
          [
            r.label,
            r.shots + " " + tr("session.shots"),
            r.points != null ? r.points + " " + tr("session.points") : "",
            r.elapsedSeconds !== undefined
              ? tr("session.elapsedSeconds") + ": " + r.elapsedSeconds + " s"
              : "",
            r.matchPercent !== undefined ? r.matchPercent + "%" : "",
            r.placement !== undefined
              ? tr("session.placement") + ": " + r.placement
              : "",
            r.dryFire ? tr("session.dryFire") : "",
            r.scoreText ?? "",
            r.status ? tr(`resultStatus.${r.status}`) : "",
            r.hits != null ? r.hits + " " + tr("session.hits") : "",
            r.figures != null ? r.figures + " " + tr("session.figures") : "",
            conditions(r),
            tr("details.penalties", {
              points: r.penaltyPoints ?? 0,
              seconds: r.penaltySeconds ?? 0,
            }),
            r.x != null ? tr("session.innerTens") + ": " + r.x : "",
            r.scoring
              ? tr(
                  r.scoring === "points"
                    ? "session.pointsScoring"
                    : "session.ordinaryScoring",
                )
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          8,
        );
    }
    y -= 10;
  }
  newPage();
  const ratings = sessionSeriesRatings(session, data.assessments);
  text(
    data.profile.displayName || tr("common.notSpecified"),
    22,
    emphasis,
    green,
  );
  text(
    tr(
      session.context === "practice"
        ? "session.practice"
        : "session.competition",
    ) +
      " · " +
      date,
    16,
    emphasis,
  );
  text(session.location || tr("common.noLocation"), 13);
  y -= 6;
  const f = session.firearmSnapshot;
  const firearm = f
    ? [
        f.make,
        f.model,
        caliberName(language, f.caliber),
        f.hasOptic ? tr("firearm.hasOptic") : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : tr("common.borrowedFirearm");
  fieldRow([
    [tr("session.sport"), disciplineName(language, session.discipline)],
    [tr("session.firearm"), firearm],
  ]);
  fieldRow([
    ...(session.program
      ? [[tr("session.program"), session.program] as [string, string]]
      : []),
    [tr("session.group"), session.group],
  ]);
  fieldRow([
    [
      tr("session.shootingTime"),
      sharedConditions.seconds != null
        ? sharedConditions.seconds + " s"
        : tr("common.notSpecified"),
    ],
    [
      tr("session.distance"),
      sharedConditions.distance != null
        ? sharedConditions.distance + " m"
        : tr("common.notSpecified"),
    ],
    [
      tr("session.target"),
      sharedConditions.target
        ? targetName(language, sharedConditions.target)
        : tr("common.notSpecified"),
    ],
  ]);
  const ruleGroups = appliedRuleGroups(session, ratings);
  const editions = ruleGroups.map(
    (group) =>
      (group.edition
        ? group.declared
          ? group.edition
          : localizeMessage(language, group.edition)
        : tr("details.ruleEditionUnknown")) +
      (ruleGroups.length > 1 ? " · " + group.series.join(", ") : ""),
  );
  const ruleField: [string, string] = [
    tr("details.ruleVersion"),
    editions.join("\n") || session.ruleReference || tr("details.notRecorded"),
  ];
  const ageGroups = appliedAgeGroups(ratings);
  fieldRow([
    ruleField,
    ...(precision
      ? [
          [
            tr("details.calculationAge"),
            ageGroups
              .map(
                (group) =>
                  (group.age === undefined
                    ? tr("details.notRecorded")
                    : tr("print.scoringAge", {
                        age: group.age,
                        year: group.year ?? "",
                      })) +
                  (ageGroups.length > 1 ? " · " + group.series.join(", ") : ""),
              )
              .join("\n") || tr("details.notRecorded"),
          ] as [string, string],
        ]
      : []),
  ]);
  text(
    tr("common.seriesCount", { count: session.results.length }) +
      " · " +
      session.results.reduce((sum, r) => sum + r.shots, 0) +
      " " +
      tr("session.shots").toLocaleLowerCase(locale),
    9,
    regular,
    muted,
  );
  heading(tr("session.results"));
  headerRow();
  for (const { result: r, medal } of ratings) {
    const currentWitnesses = signoffs.filter(
      (w) => w.resultId === r.id && witnessCurrent(w, session),
    );
    const details = [
      r.stageDistance !== undefined ||
      r.stageTimeLimit !== undefined ||
      r.stageTarget !== undefined ||
      (r.distance != null && r.distance !== sharedConditions.distance) ||
      (r.seconds != null && r.seconds !== sharedConditions.seconds) ||
      (r.target != null && r.target !== sharedConditions.target)
        ? conditions(seriesConditions(session, r))
        : "",
      r.elapsedSeconds !== undefined
        ? tr("session.elapsedSeconds") + ": " + r.elapsedSeconds + " s"
        : "",
      r.matchPercent !== undefined
        ? tr("session.matchPercent") + ": " + r.matchPercent + "%"
        : "",
      r.placement !== undefined
        ? tr("session.placement") + ": " + r.placement
        : "",
      hitFactor(r, session.discipline) !== undefined
        ? tr("session.hitFactor") +
          ": " +
          hitFactor(r, session.discipline)!.toFixed(4)
        : "",
      r.dryFire ? tr("session.dryFire") : "",
      r.scoreText ?? "",
      r.status && r.status !== "completed"
        ? tr(`resultStatus.${r.status}`)
        : "",
      r.scoring
        ? tr(
            r.scoring === "points"
              ? "session.pointsScoring"
              : "session.ordinaryScoring",
          )
        : "",
      r.penaltyPoints || r.penaltySeconds
        ? tr("details.penalties", {
            points: r.penaltyPoints ?? 0,
            seconds: r.penaltySeconds ?? 0,
          })
        : "",
      r.x != null ? tr("session.innerTens") + ": " + r.x : "",
      currentWitnesses.length
        ? tr("print.witnessed", {
            names: currentWitnesses.map((w) => w.name).join(", "),
          })
        : "",
    ].filter(Boolean);
    const labelLines = lines(r.label, 195, emphasis, 10);
    const detailLines = details.flatMap((value) =>
      lines(value, width - 10, regular, 8),
    );
    const height =
      Math.max(20, labelLines.length * 14) + detailLines.length * 12 + 14;
    if (y - height < bottom) {
      newPage();
      headerRow();
    }
    labelLines.forEach((value, i) =>
      page.drawText(value, {
        x: left + 5,
        y: y - i * 14,
        size: 10,
        font: emphasis,
        color: ink,
      }),
    );
    const cells = [
      String(r.shots),
      r.points != null ? String(netPoints(r, session.discipline)) : "-",
      ...(precision ? [] : [(r.hits ?? "-") + " / " + (r.figures ?? "-")]),
      medal ? tr(`level.${medal}`) : "-",
    ];
    (precision ? [300, 390, width - 5] : [252, 322, 414, width - 5]).forEach(
      (x, i) =>
        page.drawText(cells[i], {
          x: left + x - regular.widthOfTextAtSize(cells[i], 10),
          y,
          size: 10,
          font: regular,
          color: ink,
        }),
    );
    y -= Math.max(20, labelLines.length * 14);
    for (const value of detailLines) {
      ensure(12);
      page.drawText(value, {
        x: left + 5,
        y,
        size: 8,
        font: regular,
        color: muted,
      });
      y -= 12;
    }
    page.drawLine({
      start: { x: left, y: y + 1 },
      end: { x: left + width, y: y + 1 },
      thickness: 0.5,
      color: line,
    });
    y -= 14;
    for (const w of signoffs.filter((w) => w.resultId === r.id))
      await renderWitness(w);
  }
  text(tr("print.netPoints"), 8, regular, muted);
  text(tr("details.assessmentHelp"), 8, regular, muted);
  if (session.notes) {
    heading(tr("common.notes"));
    text(session.notes);
  }
  const remainingSignoffs = signoffs.filter(
    (w) => !w.resultId || !session.results.some((r) => r.id === w.resultId),
  );
  if (remainingSignoffs.length) {
    ensure(155);
    heading(tr("witness.heading"));
  }
  for (const w of remainingSignoffs) await renderWitness(w);
  if (signoffs.length) text(tr("witness.identity"), 8, regular, muted);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: left, y: 94 },
      end: { x: left + width, y: 94 },
      thickness: 0.5,
      color: line,
    });
    p.drawImage(qr, { x: 482, y: 14, width: 74, height: 74 });
    p.drawText(tr("print.open"), {
      x: 482,
      y: 6,
      size: 8,
      font: regular,
      color: green,
    });
    p.drawText(tr("print.footer") + " · MyShotLog", {
      x: left,
      y: 76,
      size: 9,
      font: emphasis,
      color: green,
    });
    p.drawText(
      tr("print.reference", { id: session.id, revision: session.revision }),
      { x: left, y: 60, size: 7, font: regular, color: muted },
    );
    p.drawText(tr("print.page", { page: i + 1, pages: pages.length }), {
      x: left,
      y: 28,
      size: 8,
      font: regular,
      color: muted,
    });
    const annotation = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [482, 6, 556, 88],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(sessionUrl) },
      }),
    );
    p.node.addAnnot(annotation);
  });
  doc.setTitle("MyShotLog - " + tr("print.title") + " - " + session.date);
  doc.setCreator("MyShotLog");
  return doc.save();
}
