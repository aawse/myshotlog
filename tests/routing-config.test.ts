import { it, expect } from "vitest";
import config from "../next.config";
import vercel from "../vercel.json";
it("keeps Next.js and Vercel trailing-slash normalization aligned", () => {
  expect(config.trailingSlash).toBe(true);
  expect(config.trailingSlash).toBe(vercel.trailingSlash);
});
