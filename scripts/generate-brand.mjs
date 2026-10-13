// Regenerate outlined branding on any OS from the bundled, openly licensed font.
import { readFile, writeFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const green = "#315d43",
  ink = "#233329",
  gold = "#bc9864";
const font = fontkit.create(
  await readFile(
    new URL("../lib/fonts/DidactGothic-Regular.ttf", import.meta.url),
  ),
);
const size = 84,
  scale = size / font.unitsPerEm,
  run = font.layout("MyShotLog");
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
function mark(mono = false) {
  const colour = mono ? "currentColor" : green;
  return `<g fill="none" stroke="${colour}" stroke-width="9"><circle cx="128" cy="128" r="88"/><circle cx="128" cy="128" r="48"/></g><circle cx="128" cy="128" r="9" fill="${mono ? "currentColor" : gold}"/>`;
}
function svg(full, mono = false) {
  const w = full ? width : 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="256" viewBox="0 0 ${w} 256" role="img" aria-labelledby="title desc"><title id="title">MyShotLog</title><desc id="desc">A clean concentric target and precise centre dot, with a Didact Gothic MyShotLog wordmark.</desc>${mark(mono)}${full ? `<g fill="${mono ? "currentColor" : ink}" transform="translate(246 150)">${lettering}</g>` : ""}</svg>\n`;
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
