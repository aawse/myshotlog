// Original A4 practice sheets. No federation artwork or official scoring rings.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
const root = new URL("../", import.meta.url);
const mm = (value) => (value * 72) / 25.4;
const ink = rgb(0.08, 0.12, 0.1);
const fontBytes = await readFile(
  new URL("lib/fonts/DidactGothic-Regular.ttf", root),
);
await mkdir(new URL("public/training/", root), { recursive: true });
for (const language of ["sv", "en"]) {
  const text = JSON.parse(
    await readFile(new URL(`lib/locales/${language}.json`, root), "utf8"),
  );
  for (const type of ["aiming-dots", "alignment-grid"]) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(fontBytes, { subset: true });
    const page = pdf.addPage([mm(210), mm(297)]);
    const label = (value, x, y, size = 11) =>
      page.drawText(value, {
        x: mm(x),
        y: mm(297 - y),
        size,
        font,
        color: ink,
      });
    label("MyShotLog", 20, 20, 19);
    label(
      text[type === "aiming-dots" ? "training.dots" : "training.grid"],
      20,
      30,
      13,
    );
    label(text["training.pdfSubtitle"], 20, 39, 10);
    if (type === "aiming-dots") {
      for (const [row, diameter] of [20, 30, 40].entries()) {
        for (const x of [62, 148]) {
          page.drawCircle({
            x: mm(x),
            y: mm(297 - (75 + row * 72)),
            size: mm(diameter / 2),
            color: rgb(0, 0, 0),
          });
          label(`${diameter} mm`, x - 5, 99 + row * 72, 9);
        }
      }
    } else {
      for (let x = 30; x <= 180; x += 5)
        page.drawLine({
          start: { x: mm(x), y: mm(57) },
          end: { x: mm(x), y: mm(237) },
          thickness: x % 10 ? 0.25 : 0.5,
          color: rgb(0.55, 0.55, 0.55),
        });
      for (let y = 57; y <= 237; y += 5)
        page.drawLine({
          start: { x: mm(30), y: mm(y) },
          end: { x: mm(180), y: mm(y) },
          thickness: (y - 57) % 10 ? 0.25 : 0.5,
          color: rgb(0.55, 0.55, 0.55),
        });
      label("5 mm", 30, 246, 9);
    }
    page.drawLine({
      start: { x: mm(20), y: mm(27) },
      end: { x: mm(70), y: mm(27) },
      thickness: 1,
      color: ink,
    });
    for (const x of [20, 70])
      page.drawLine({
        start: { x: mm(x), y: mm(25) },
        end: { x: mm(x), y: mm(29) },
        thickness: 1,
        color: ink,
      });
    label(text["training.pdfScale"], 20, 282, 9);
    pdf.setTitle(`MyShotLog - ${type} - ${language}`);
    pdf.setAuthor("MyShotLog");
    // Stable metadata keeps regeneration reproducible.
    pdf.setCreationDate(new Date("2026-10-15T00:00:00Z"));
    pdf.setModificationDate(new Date("2026-10-15T00:00:00Z"));
    await writeFile(
      new URL(`public/training/${type}-${language}.pdf`, root),
      await pdf.save(),
    );
  }
}
console.log("Generated four A4 practice sheets.");
