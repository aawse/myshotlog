import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import manifest from "../app/manifest";
it("provides same-origin standalone installation with correctly sized icons", async () => {
  const data = manifest();
  expect(data.display).toBe("standalone");
  expect(data.id).toBe("/");
  expect(data.scope).toBe("/");
  expect(data.start_url?.startsWith("/")).toBe(true);
  for (const icon of data.icons ?? []) {
    expect(icon.src.startsWith("/brand/")).toBe(true);
    const png = await readFile(
      new URL("../public" + icon.src, import.meta.url),
    );
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  expect(data.icons).toHaveLength(2);
});
