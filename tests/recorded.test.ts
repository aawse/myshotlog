import { it, expect } from "vitest";
import { recordSeries } from "../lib/rules/recorded";
import { rules } from "../lib/rules/catalog";
import { profile, session, result } from "./fixtures";
import type { Assessment } from "../lib/models";
it("calculates legacy sessions without saved assessments or physical verification fields", () => {
  const raw = {
    ...result,
    distance: undefined,
    target: undefined,
    seconds: undefined,
    conditionsConfirmed: false,
    evidence: "",
  };
  expect(recordSeries(session, raw, profile, []).map((a) => a.status)).toEqual([
    "met",
    "met",
    "met",
  ]);
});
it("uses the ruleset for the session date rather than saved blocked conclusions", () => {
  const previous = recordSeries(session, result, profile, []).map((a) => ({
    ...a,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "not-evaluated" as const,
    input: { birthYear: 1990 },
  }));
  const next = {
    ...rules[0],
    id: "2027-update",
    from: "2027-01-01",
    until: "2028-01-01",
    precision: { A: [33, 39, 44], B: [34, 40, 46], C: [35, 41, 47] },
  } as (typeof rules)[0];
  const old = { ...rules[0], until: "2027-01-01" };
  const before = recordSeries(session, result, profile, previous, [old, next]);
  expect(before[2].ruleVersion).toBe(old.id);
  expect(before[2].status).toBe("met");
  const after = recordSeries(
    { ...session, date: "2027-01-01" },
    result,
    profile,
    previous,
    [old, next],
  );
  expect(after[2].ruleVersion).toBe(next.id);
  expect(after[2].status).toBe("not-met");
});
it("uses captured birth information where available and profile fallback for legacy series without it", () => {
  const older = { ...profile, birthYear: 1960 };
  const legacy = recordSeries(
    session,
    { ...result, points: 45 },
    profile,
    [],
  ).map((a) => ({
    ...a,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  })) as Assessment[];
  expect(
    recordSeries(session, { ...result, points: 45 }, older, legacy)[2].status,
  ).toBe("not-met");
  expect(
    recordSeries(session, { ...result, points: 45 }, older, [])[2].status,
  ).toBe("met");
});
it("uses ordinary thresholds when birth data is missing", () => {
  const a = recordSeries(
    session,
    result,
    { ...profile, birthYear: null, birthDate: null },
    [],
  );
  expect(a[2].status).toBe("met");
  expect(a[2].reason).toContain("Utan åldersavdrag");
});
