import { it, expect } from "vitest";
import sharp from "sharp";
import { reusableWebp, stripWebpMetadata } from "../lib/photos/webp";
import { PHOTO_MAX_BYTES } from "../lib/photos/schema";
const image = (width = 800) =>
  sharp({ create: { width, height: 600, channels: 3, background: "#f7f2da" } });
it("reuses compliant static WebP based on its bytes", async () => {
  const data = await image().webp().toBuffer();
  expect(reusableWebp(data, 800, 600)).toBe(true);
  expect(reusableWebp(new Uint8Array(data), 800, 600)).toBe(true);
  for (const data of [
    await image().png().toBuffer(),
    await image().jpeg().toBuffer(),
    await image().gif().toBuffer(),
  ])
    expect(reusableWebp(data, 800, 600)).toBe(false);
});
it("requires optimization for metadata, dimensions, or excessive size", async () => {
  expect(
    reusableWebp(await image().withMetadata().webp().toBuffer(), 800, 600),
  ).toBe(false);
  expect(reusableWebp(await image(1800).webp().toBuffer(), 1800, 600)).toBe(
    false,
  );
  expect(reusableWebp(new Uint8Array(PHOTO_MAX_BYTES + 1), 800, 600)).toBe(
    false,
  );
});
it("does not reuse truncated or animated WebP containers", async () => {
  const data = await image().webp().toBuffer();
  expect(reusableWebp(data.subarray(0, data.length - 1), 800, 600)).toBe(false);
  const animated = Buffer.concat([
    data,
    Buffer.from([65, 78, 73, 77, 0, 0, 0, 0]),
  ]);
  animated.writeUInt32LE(animated.length - 8, 4);
  expect(reusableWebp(animated, 800, 600)).toBe(false);
  const malformed = Buffer.from(data);
  malformed.writeUInt32LE(0xffffffff, 16);
  expect(reusableWebp(malformed, 800, 600)).toBe(false);
});

it("strips metadata without changing the decoded pixels or alpha and passes server validation", async () => {
  const { validateUploadedPhoto } = await import("../lib/photos/server");
  for (const original of [
    await image().withMetadata().webp().toBuffer(),
    await image().ensureAlpha(0.5).withMetadata().webp().toBuffer(),
  ]) {
    const cleaned = Buffer.from(stripWebpMetadata(original));
    const meta = await sharp(cleaned).metadata();
    expect(meta.icc).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(await sharp(cleaned).raw().toBuffer()).toEqual(
      await sharp(original).raw().toBuffer(),
    );
    expect(reusableWebp(cleaned, 800, 600)).toBe(true);
    await expect(validateUploadedPhoto(cleaned)).resolves.toMatchObject({
      mediaType: "image/webp",
    });
  }
  const plain = await image().webp().toBuffer();
  expect(Buffer.from(stripWebpMetadata(plain))).toEqual(plain);
  expect(() => stripWebpMetadata(plain.subarray(0, 15))).toThrow();
});
