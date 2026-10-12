import { it, expect } from "vitest";
import { rules, catalogSchema } from "../lib/rules/catalog";
it("accepts the installed rules with precise provenance", () => {
  expect(catalogSchema.parse(rules)).toEqual(rules);
});
it("rejects overlapping periods, duplicate IDs and unsupported age conventions", () => {
  expect(() =>
    catalogSchema.parse([...rules, { ...rules[0], id: "other" }]),
  ).toThrow();
  expect(() => catalogSchema.parse([...rules, rules[0]])).toThrow();
  expect(() =>
    catalogSchema.parse([{ ...rules[0], ageBasis: "today" }]),
  ).toThrow();
  expect(() =>
    catalogSchema.parse([{ ...rules[0], until: rules[0].from }]),
  ).toThrow();
});
