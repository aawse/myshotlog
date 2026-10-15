import data from "./programs.json";
import { t, messages, type Language, type MessageKey } from "../i18n";
import { discipline } from "../disciplines";
import type { Session, Firearm, Result } from "../models";
import { z } from "../validation";
import { disciplineIds } from "../disciplines";
const label = z
  .enum(Object.keys(messages.sv) as [MessageKey, ...MessageKey[]])
  .refine((key) => key in messages.en);
const positive = z.number().int().min(1).max(100);
const blockSchema = z
  .object({
    count: positive,
    shots: z.number().int().min(1).max(1000),
    distance: z.number().finite().nonnegative().optional(),
    seconds: z.number().finite().nonnegative().optional(),
    target: z.string().max(120).optional(),
    phase: label.optional(),
    round: positive.optional(),
    match: positive.optional(),
    index: positive.optional(),
  })
  .strict();
export const programs = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        discipline: z.enum(disciplineIds),
        labelKey: label,
        blocks: z.array(blockSchema).min(1).max(100),
        ppcClass: z.string().max(100).optional(),
        source: z.string().max(500).optional(),
        variable: z.boolean().optional(),
      })
      .strict(),
  )
  .parse(data);
export type Program = (typeof programs)[number];
export function suggestedRuleReference(
  sport: Session["discipline"],
  date: string,
) {
  return sport.startsWith("ipsc-") &&
    date >= "2026-01-01" &&
    date < "2027-01-01"
    ? "IPSC 2026"
    : sport === "nordic-steel" && date >= "2024-04-01"
      ? "Nordic Steel Challenge 2024-04"
      : sport === "dmr" && date >= "2024-01-01"
        ? "SDSSF DMR 2024 v1.1"
        : undefined;
}
export function eventPrograms(sport: Session["discipline"]) {
  return programs.filter((p) => p.discipline === sport);
}
export function programName(program: Program, language: Language) {
  return t(language, program.labelKey as MessageKey);
}
export function distanceText(result: Result) {
  return result.stageDistance !== undefined
    ? `${result.stageDistance} ${result.stageDistanceUnit ?? "m"}`
    : result.distance !== undefined
      ? `${result.distance} m`
      : "";
}
export function classSuggestions(sport: Session["discipline"]) {
  if (sport === "ppc")
    return [
      ...new Set(
        programs.flatMap((p) =>
          p.discipline === "ppc" && p.ppcClass ? [p.ppcClass] : [],
        ),
      ),
      "P1500 Optical",
      "R1500 Optical",
    ];
  if (sport.includes("pcc")) return ["Optics", "Iron"];
  if (
    ["dynamic", "open"].includes(discipline(sport).kind) ||
    sport.startsWith("magnum-")
  )
    return [];
  return ["A", "A optisk", "B", "C", "R"];
}
export function classFor(session: Session, firearm?: Firearm) {
  const saved = firearm?.classDefaults?.[session.discipline];
  if (session.discipline === "ppc") {
    let group =
      programs.find((p) => p.id === session.presetId)?.ppcClass ||
      saved ||
      (firearm?.firearmType === "revolver" ? "R1500" : "P1500");
    if (firearm?.hasOptic && ["P1500", "R1500"].includes(group))
      group += " Optical";
    else if (
      firearm?.hasOptic &&
      !["Open", "P1500 Optical", "R1500 Optical"].includes(group)
    )
      return "";
    return group;
  }
  if (saved) return saved;
  if (session.discipline === "custom") return "—";
  if (session.discipline.includes("pcc"))
    return firearm?.hasOptic ? "Optics" : "Iron";
  if (
    session.discipline.startsWith("ipsc-") ||
    ["nordic-steel", "dmr", "custom", "sra"].includes(session.discipline)
  )
    return "";
  if (session.discipline === "air") return firearm?.group || "C";
  if (
    [
      "precision",
      "rapid",
      "national",
      "military",
      "field",
      "falling",
      "application",
    ].includes(session.discipline) &&
    [".22 LR", ".22"].includes(firearm?.caliber ?? "") &&
    !firearm?.hasOptic
  )
    return "C";
  return firearm?.hasOptic ? "" : firearm?.group || "";
}
export function applyProgram(
  session: Session,
  program: Program,
  language: Language,
  firearm?: Firearm,
  options: { unit?: "m" | "yd"; count?: number } = {},
): Session {
  if (program.discipline !== session.discipline)
    throw new Error("eventSportMismatch");
  const kind = discipline(session.discipline).kind;
  const rows: Result[] = [];
  for (const block of program.blocks) {
    const b = block as {
      count: number;
      shots: number;
      distance?: number;
      seconds?: number;
      target?: string;
      phase?: string;
      round?: number;
      match?: number;
      index?: number;
    };
    const count = program.variable ? (options.count ?? b.count) : b.count;
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100 ||
      rows.length + count > 100
    )
      throw new Error("eventCount");
    for (let i = 0; i < count; i++) {
      const n = b.index ?? i + 1;
      const base = b.match
        ? t(language, "event.ppcStage", { match: b.match, n })
        : b.phase
          ? t(language, b.phase as MessageKey, { n, round: b.round ?? "" }) +
            " · " +
            t(language, "event.series", { n })
          : t(
              language,
              session.discipline === "ppc"
                ? "event.stage"
                : program.variable
                  ? "event.stage"
                  : "event.series",
              { n },
            );
      const unit = session.discipline === "ppc" ? (options.unit ?? "yd") : "m";
      rows.push({
        id: crypto.randomUUID(),
        label:
          base + (b.distance !== undefined ? ` · ${b.distance} ${unit}` : ""),
        type: session.discipline === "application" ? "application" : "score",
        shots: b.shots,
        ...(session.discipline !== "nordic-steel" &&
        ["points", "dynamic", "open"].includes(kind)
          ? { points: 0 }
          : { hits: 0 }),
        ...(b.distance !== undefined
          ? { stageDistance: b.distance, stageDistanceUnit: unit }
          : {}),
        ...(b.seconds !== undefined ? { stageTimeLimit: b.seconds } : {}),
        ...(b.target ? { stageTarget: b.target } : {}),
      });
    }
  }
  const shared = (key: "stageDistance" | "stageTimeLimit" | "stageTarget") =>
    rows.every((row) => row[key] === rows[0][key]) ? rows[0][key] : undefined;
  const next = {
    ...session,
    presetId: program.id,
    ruleReference:
      session.ruleReference ??
      suggestedRuleReference(session.discipline, session.date),
    program:
      session.discipline === "custom" ? "" : programName(program, language),
    results: rows,
    distance:
      session.discipline === "ppc"
        ? null
        : ((shared("stageDistance") as number | undefined) ?? null),
    seconds: (shared("stageTimeLimit") as number | undefined) ?? null,
    target: (shared("stageTarget") as string | undefined) ?? null,
  };
  const perStage =
    session.discipline === "ppc" ||
    program.variable ||
    (["stageDistance", "stageTimeLimit", "stageTarget"] as const).some(
      (key) => new Set(rows.map((row) => row[key])).size > 1,
    );
  if (!perStage)
    for (const row of rows) {
      delete row.stageDistance;
      delete row.stageDistanceUnit;
      delete row.stageTimeLimit;
      delete row.stageTarget;
    }
  return { ...next, group: classFor(next, firearm) };
}
