// Rebuild the outlined SVGs and transparent PNGs; no system fonts are required.
import { readFile, writeFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const green = "#315d43",
  ink = "#233329",
  gold = "#bc9864";
const font = fontkit.create(
  await readFile(
    new URL("../lib/pdf/assets/DejaVuSans-Bold.ttf", import.meta.url),
  ),
);
const run = font.layout("MyShotLog");
const size = 78,
  scale = size / font.unitsPerEm;
let advance = 0;
const lettering = run.glyphs
  .map((glyph, i) => {
    const pos = run.positions[i];
    const path = `<path d="${glyph.path.toSVG()}" transform="translate(${((advance + pos.xOffset) * scale).toFixed(3)} ${(-pos.yOffset * scale).toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`;
    advance += pos.xAdvance;
    return path;
  })
  .join("");
const width = Math.ceil(advance * scale + 270);
function mark() {
  const body = green;
  const center = gold;
  // A shield protects the journal; concentric rings express accuracy and focus.
  return `<path d="M128 20 216 53V122C216 173 183 209 128 237C73 209 40 173 40 122V53Z" fill="${body}"/>
  <g fill="none" stroke="#ffffff" stroke-width="6">
    <circle cx="128" cy="112" r="43"/><circle cx="128" cy="112" r="23"/>
    <path d="M128 59V75M128 149V165M75 112H91M165 112H181"/>
  </g>
  <circle cx="128" cy="112" r="7" fill="${center}"/>
  <path d="M98 183H158M112 197H144" fill="none" stroke="#ffffff" stroke-width="5"/>`;
}
// The monochrome holes are actual masked cut-outs, so the mark works on any background.
const cutouts = `<g fill="none" stroke="black" stroke-width="6"><circle cx="128" cy="112" r="43"/><circle cx="128" cy="112" r="23"/><path d="M128 59V75M128 149V165M75 112H91M165 112H181"/></g><path d="M98 183H158M112 197H144" fill="none" stroke="black" stroke-width="5"/>`;
function svg(full, mono = false) {
  const w = full ? width : 256;
  const symbol = mono
    ? `<defs><mask id="cutout"><rect width="256" height="256" fill="white"/>${cutouts}</mask></defs><g mask="url(#cutout)"><path d="M128 20 216 53V122C216 173 183 209 128 237C73 209 40 173 40 122V53Z" fill="currentColor"/></g>`
    : mark();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="256" viewBox="0 0 ${w} 256" role="img" aria-labelledby="title desc"><title id="title">MyShotLog</title><desc id="desc">A shield enclosing a precision target and two journal lines, with an outlined MyShotLog wordmark.</desc>${symbol}${full ? `<g fill="${mono ? "currentColor" : ink}" transform="translate(246 148)">${lettering}</g>` : ""}</svg>\n`;
}
for (const [name, full, mono] of [
  ["MyShotLog-logo", true, false],
  ["MyShotLog-icon", false, false],
  ["MyShotLog-logo-monochrome", true, true],
]) {
  const content = svg(full, mono);
  await writeFile(
    new URL(`../public/brand/${name}.svg`, import.meta.url),
    content,
  );
  await sharp(Buffer.from(content))
    .resize({ width: 2400 })
    .png()
    .toFile(
      fileURLToPath(new URL(`../public/brand/${name}.png`, import.meta.url)),
    );
}
const main = Buffer.from(svg(true));
const lockup = await sharp(main).resize({ width: 700 }).png().toBuffer();
const icon = await sharp(Buffer.from(svg(false)))
  .resize(128, 128)
  .png()
  .toBuffer();
const white = await sharp(
  Buffer.from(svg(true, true).replaceAll("currentColor", "#ffffff")),
)
  .resize({ width: 600 })
  .png()
  .toBuffer();
await sharp({
  create: { width: 1100, height: 680, channels: 4, background: "#f5f6f1" },
})
  .composite([
    { input: lockup, left: 80, top: 45 },
    { input: icon, left: 100, top: 315 },
    {
      input: Buffer.from(
        '<svg width="1100" height="230"><rect width="1100" height="230" fill="#233329"/></svg>',
      ),
      left: 0,
      top: 450,
    },
    { input: white, left: 80, top: 470 },
  ])
  .png()
  .toFile(
    fileURLToPath(
      new URL("../public/brand/MyShotLog-preview.png", import.meta.url),
    ),
  );
console.log(
  `Brand assets generated. Full logo: ${width} × 256; icon: 256 × 256.`,
);
