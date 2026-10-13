import { it, expect } from "vitest";
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString } from "pdf-lib";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { createSessionPdf } from "../lib/pdf/session";
import { reviewSession } from "../lib/witness/model";
import type { Records, Session } from "../lib/models";
import type { WitnessSignoff } from "../lib/witness/model";
import { profile, session } from "./fixtures";
const url = "https://myshotlog.example/sessions/" + session.id + "/";
async function fixture() {
  const s: Session = {
    ...session,
    location: "Högdalens skyttebana",
    time: "14:30",
    notes: "Träning med Åsa Östergård.",
    results: [
      {
        ...session.results[0],
        label: "Precision – första serien",
        penaltyPoints: 1,
      },
    ],
  };
  const signature = await sharp({
    create: {
      width: 240,
      height: 70,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="240" height="70"><path d="M10 50 Q30 10 40 50 T80 25 L65 55 Q110 35 145 48 L200 30" fill="none" stroke="black" stroke-width="2"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const signoff: WitnessSignoff = {
    version: 1,
    id: "20000000-0000-4000-8000-000000000001",
    sessionId: s.id,
    resultId: null,
    name: "Åsa Östergård",
    signedAt: "2026-10-10T12:40:00Z",
    statementVersion: 1,
    statementLanguage: "sv",
    statement:
      "Jag bevittnade skjutningen och intygar att resultaten som visas här är korrekta.",
    digest: "a".repeat(64),
    snapshot: reviewSession(s, null),
    signature: {
      mediaType: "image/png",
      width: 240,
      height: 70,
      data: signature.toString("base64"),
    },
  };
  const data: Records = {
    profile: { ...profile, displayName: "Björn Åkerlund" },
    firearms: [],
    sessions: [s],
    assessments: [
      {
        id: "assessment",
        sessionId: s.id,
        resultId: s.results[0].id,
        revision: 1,
        ruleVersion: "SHB 21 / 2026",
        status: "met",
        level: "gold",
        reason: "",
        source: "",
        createdAt: "2026-10-10T12:40:00Z",
        input: {},
      },
    ],
    witnessSignoffs: [signoff],
  };
  return { data, s, signoff };
}
it.each(["sv", "en"] as const)(
  "exports readable %s PDFs with signatures and a session link on every page",
  async (language) => {
    const { data, s, signoff } = await fixture();
    data.profile.language = language;
    data.witnessSignoffs!.push({
      ...signoff,
      id: "20000000-0000-4000-8000-000000000002",
      resultId: s.results[0].id,
      snapshot: reviewSession(s, s.results[0].id),
      name: "Erik Lind",
    });
    const bytes = await createSessionPdf(data, s, url);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toContain("MyShotLog");
    for (const page of doc.getPages()) {
      expect(page.getSize().width).toBeCloseTo(595.28);
      // Each page has the logo, QR and the signature belonging to its sign-off.
      expect(
        page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).keys()
          .length,
      ).toBeGreaterThanOrEqual(3);
      // Printed text must use the same embedded family as the app and website.
      const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
      for (const key of fonts.keys()) {
        const face = fonts.lookup(key, PDFDict);
        expect(
          face.lookup(PDFName.of("BaseFont"), PDFName).decodeText(),
        ).toMatch(/^DidactGothic-Regular/);
      }
      const annotations = page.node.lookup(PDFName.of("Annots"), PDFArray);
      const annotation = annotations.lookup(0, PDFDict);
      expect(
        annotation
          .lookup(PDFName.of("A"), PDFDict)
          .lookup(PDFName.of("URI"), PDFString)
          .decodeText(),
      ).toBe(url);
    }
    const preview = process.env.PDF_PREVIEW_DIRECTORY;
    if (preview) {
      await mkdir(preview, { recursive: true });
      await writeFile(preview + `/session-${language}.pdf`, bytes);
    }
  },
);
it("paginates 100 series, long notes and historical witness snapshots", async () => {
  const { data, s, signoff } = await fixture();
  s.results = Array.from({ length: 100 }, (_, i) => ({
    ...s.results[0],
    id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    label: `${i + 1}. Lång serie med svenska tecken å ä ö och flera ord`,
  }));
  s.notes = "Lång anteckning med radbrytning.\n".repeat(150);
  // Signed snapshot still describes one older series; it must be marked as changed.
  data.witnessSignoffs = [signoff];
  const bytes = await createSessionPdf(data, s, url);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBeGreaterThan(8);
  const preview = process.env.PDF_PREVIEW_DIRECTORY;
  if (preview) await writeFile(preview + "/session-long.pdf", bytes);
});
it("excludes target photo data and unrelated witness signatures", async () => {
  const { data, s, signoff } = await fixture();
  s.results[0].photoId = "b".repeat(64);
  data.photos = [{ data: "not-an-image" }] as never;
  data.witnessSignoffs = [
    {
      ...signoff,
      sessionId: "40000000-0000-4000-8000-000000000000",
      signature: { ...signoff.signature, data: "not-an-image" },
    },
  ];
  expect(
    (
      await PDFDocument.load(await createSessionPdf(data, s, url))
    ).getPageCount(),
  ).toBe(1);
});
