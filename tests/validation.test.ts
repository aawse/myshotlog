import { it, expect } from "vitest";
import { z } from "../lib/validation";
it("validates schemas without eval/Function compilation under the enforced CSP", () => {
  expect(z.config().jitless).toBe(true);
  const schema = z
    .object({ name: z.string().min(1), count: z.number().int() })
    .strict();
  expect(schema.parse({ name: "series", count: 5 })).toEqual({
    name: "series",
    count: 5,
  });
  expect(schema.safeParse({ name: "", count: "five" }).success).toBe(false);
});
