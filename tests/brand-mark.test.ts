import sharp from "sharp";
import { expect, it } from "vitest";

it("renders the approved cutouts in both the install icon and header mark", async () => {
  for (const asset of [
    "public/brand/MyShotLog-icon.svg",
    "public/redesign/target.svg",
  ]) {
    const { data, info } = await sharp(asset, { density: 576 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) =>
      data[
        (Math.floor(((y + 50) / 100) * info.height) * info.width +
          Math.floor(((x + 50) / 100) * info.width)) *
          info.channels +
          3
      ];
    for (const [x, y] of [
      [-10, -4],
      [-6, -9],
      [-3, -3],
      [1, 3],
      [13, -5],
    ]) {
      expect(alpha(x, y), asset).toBe(0);
    }
    expect(alpha(-8, -6), asset).toBe(0);
    expect(alpha(6, -1), asset).toBe(255);
  }
});
