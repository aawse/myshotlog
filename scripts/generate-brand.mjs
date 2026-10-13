// Regenerate assets on any OS from the saved Helvetica Neue lettering outlines.
// To change the outlines, set MYSHOTLOG_BRAND_FONT to a locally licensed font file.
import { readFile, writeFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const green = "#315d43",
  ink = "#233329",
  gold = "#bc9864";
const outlineUrl = new URL("./brand-wordmark.json", import.meta.url);
let wordmark;
if (process.env.MYSHOTLOG_BRAND_FONT) {
  const source = fontkit.create(
    await readFile(process.env.MYSHOTLOG_BRAND_FONT),
  );
  const font = source.fonts
    ? source.fonts.find(
        (font) => font.postscriptName === "HelveticaNeue-Medium",
      )
    : source;
  if (!font || font.familyName !== "Helvetica Neue")
    throw new Error("Use a licensed Helvetica Neue Medium font file.");
  const size = 78,
    scale = size / font.unitsPerEm,
    run = font.layout("MyShotLog");
  let advance = 0;
  const paths = run.glyphs
    .map((glyph, i) => {
      const pos = run.positions[i];
      const path = `<path d="${glyph.path.toSVG()}" transform="translate(${((advance + pos.xOffset) * scale).toFixed(3)} ${(-pos.yOffset * scale).toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`;
      advance += pos.xAdvance;
      return path;
    })
    .join("");
  wordmark = {
    font: font.fullName,
    width: Math.ceil(advance * scale + 270),
    paths,
  };
  await writeFile(outlineUrl, JSON.stringify(wordmark, null, 2) + "\n");
} else wordmark = JSON.parse(await readFile(outlineUrl, "utf8"));
const width = wordmark.width,
  lettering = wordmark.paths;
const shield =
  "M128 20 216 53V122C216 173 183 209 128 237C73 209 40 173 40 122V53Z";
function mark() {
  return `<path d="${shield}" fill="${green}"/><circle cx="128" cy="120" r="42" fill="none" stroke="#ffffff" stroke-width="8"/><circle cx="128" cy="120" r="8" fill="${gold}"/>`;
}
// Monochrome target details are transparent cut-outs, preserving the background.
const cutouts =
  '<circle cx="128" cy="120" r="42" fill="none" stroke="black" stroke-width="8"/><circle cx="128" cy="120" r="8" fill="black"/>';
function svg(full, mono = false) {
  const w = full ? width : 256;
  const symbol = mono
    ? `<defs><mask id="cutout"><rect width="256" height="256" fill="white"/>${cutouts}</mask></defs><g mask="url(#cutout)"><path d="${shield}" fill="currentColor"/></g>`
    : mark();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="256" viewBox="0 0 ${w} 256" role="img" aria-labelledby="title desc"><title id="title">MyShotLog</title><desc id="desc">A minimal shield and precision target, with a Helvetica Neue Medium MyShotLog wordmark.</desc>${symbol}${full ? `<g fill="${mono ? "currentColor" : ink}" transform="translate(246 150)">${lettering}</g>` : ""}</svg>\n`;
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
  create: { width: 1100, height: 740, channels: 4, background: "#f5f6f1" },
})
  .composite([
    { input: lockup, left: 80, top: 45 },
    { input: icon, left: 100, top: 315 },
    {
      input: Buffer.from(
        '<svg width="1100" height="290"><rect width="1100" height="290" fill="#233329"/></svg>',
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

// Multi-resolution ICO supports browsers that do not use the SVG favicon.
const iconSvg = Buffer.from(svg(false));
const iconSizes = [16, 32, 48];
const images = await Promise.all(
  iconSizes.map((size) => sharp(iconSvg).resize(size, size).png().toBuffer()),
);
const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((image, i) => {
  const entry = 6 + i * 16;
  directory[entry] = iconSizes[i];
  directory[entry + 1] = iconSizes[i];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(
  new URL("../app/favicon.ico", import.meta.url),
  Buffer.concat([directory, ...images]),
);
const apple = await sharp(iconSvg).resize(140, 140).png().toBuffer();
const appleCanvas = await sharp({
  create: { width: 180, height: 180, channels: 3, background: "#f5f6f3" },
})
  .composite([{ input: apple, left: 20, top: 20 }])
  .png()
  .toBuffer();
await sharp(appleCanvas)
  .removeAlpha()
  .png()
  .toFile(
    fileURLToPath(
      new URL(
        "../public/brand/MyShotLog-apple-touch-icon.png",
        import.meta.url,
      ),
    ),
  );
