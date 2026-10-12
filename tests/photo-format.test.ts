import { it, expect } from "vitest";
import sharp from "sharp";
import { reusableJpeg, stripJpegMetadata } from "../lib/photos/jpeg";
import { PHOTO_MAX_BYTES } from "../lib/photos/schema";
const image = (width = 800) =>
  sharp({ create: { width, height: 600, channels: 3, background: "#f7f2da" } });
it("reuses compliant static JPEG based on its bytes", async () => {
  const data = await image().jpeg().toBuffer();
  expect(reusableJpeg(data, 800, 600)).toBe(true);
  expect(reusableJpeg(new Uint8Array(data), 800, 600)).toBe(true);
  for (const data of [
    await image().png().toBuffer(),
    await image().webp().toBuffer(),
    await image().gif().toBuffer(),
  ])
    expect(reusableJpeg(data, 800, 600)).toBe(false);
});
it("requires optimization for metadata, dimensions, or excessive size", async () => {
  expect(
    reusableJpeg(await image().withMetadata().jpeg().toBuffer(), 800, 600),
  ).toBe(false);
  expect(reusableJpeg(await image(1800).jpeg().toBuffer(), 1800, 600)).toBe(
    false,
  );
  expect(reusableJpeg(new Uint8Array(PHOTO_MAX_BYTES + 1), 800, 600)).toBe(
    false,
  );
});
it("rejects truncated JPEG containers", async () => {
  const data = await image().jpeg().toBuffer();
  expect(reusableJpeg(data.subarray(0, data.length - 1), 800, 600)).toBe(false);
  expect(() => stripJpegMetadata(data.subarray(0, 15))).toThrow();
});

it("strips metadata without changing the decoded pixels and passes server validation", async () => {
  const { validateUploadedPhoto } = await import("../lib/photos/server");
  for (const original of [
    await image().withMetadata().jpeg().toBuffer(),
    await image().jpeg({ progressive: true }).withMetadata().toBuffer(),
  ]) {
    const cleaned = Buffer.from(stripJpegMetadata(original));
    const meta = await sharp(cleaned).metadata();
    expect(meta.icc).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(await sharp(cleaned).raw().toBuffer()).toEqual(
      await sharp(original).raw().toBuffer(),
    );
    expect(reusableJpeg(cleaned, 800, 600)).toBe(true);
    await expect(validateUploadedPhoto(cleaned)).resolves.toMatchObject({
      mediaType: "image/jpeg",
    });
  }
  const plain = await image().jpeg().toBuffer();
  expect(Buffer.from(stripJpegMetadata(plain))).toEqual(plain);
  expect(() => stripJpegMetadata(plain.subarray(0, 15))).toThrow();
});
