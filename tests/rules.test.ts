import { describe, it, expect } from "vitest";
import {
  evaluate,
  ageReduction,
  progress,
  summarize,
} from "../lib/rules/engine";
import { rules, levels } from "../lib/rules/catalog";
import { disciplines } from "../lib/disciplines";
import { session, result, profile } from "./fixtures";
describe("SPSF 2026 normal badge path", () => {
  for (const group of ["A", "B", "C"] as const)
    for (const [i, level] of levels.entries())
      for (const delta of [-1, 0, 1])
        it(`${group} ${level} precision boundary ${delta}`, () => {
          const points = rules[0].precision[group][i] + delta;
          const a = evaluate(
            { ...session, group },
            { ...result, points },
            profile,
          )[i];
          expect(a.status).toBe(delta >= 0 ? "met" : "not-met");
          expect(a.source).toContain("5.1.1");
        });
  for (const group of ["A", "B", "C"] as const)
    for (const [i, level] of levels.entries())
      for (const delta of [-1, 0, 1])
        it(`${group} ${level} application time ${delta}`, () => {
          const a = evaluate(
            { ...session, discipline: "application", group },
            {
              ...result,
              type: "application",
              shots: 6,
              hits: rules[0].application[i],
              target: "C30",
              seconds: rules[0].applicationSeconds[group][i] + delta,
            },
            profile,
          )[i];
          expect(a.status).toBe(delta <= 0 ? "met" : "not-met");
        });
  for (const [i, level] of levels.entries())
    for (const delta of [-1, 0, 1])
      it(`${level} application hits ${delta}`, () => {
        const a = evaluate(
          { ...session, discipline: "application" },
          {
            ...result,
            type: "application",
            shots: 6,
            hits: rules[0].application[i] + delta,
            target: "C30",
            seconds: rules[0].applicationSeconds.C[i],
          },
          profile,
        )[i];
        expect(a.status).toBe(
          rules[0].application[i] + delta > 6
            ? "not-evaluated"
            : delta >= 0
              ? "met"
              : "not-met",
        );
      });
  it("uses previous calendar year at 55 and 65", () => {
    expect(ageReduction(1971, 2026)).toBe(0);
    expect(ageReduction(1970, 2026)).toBe(1);
    expect(ageReduction(1961, 2026)).toBe(1);
    expect(ageReduction(1960, 2026)).toBe(2);
    expect(
      evaluate(
        session,
        { ...result, points: 45 },
        { ...profile, birthYear: 1970 },
      )[2].status,
    ).toBe("met");
  });
  it("does not evaluate missing age or unsupported weapon/date", () => {
    for (const a of [
      evaluate({ ...session, group: "A optisk" }, result, profile),
      evaluate({ ...session, date: "2025-12-31" }, result, profile),
      evaluate({ ...session, date: "2028-01-01" }, result, profile),
    ])
      expect(a.every((x) => x.status === "not-evaluated")).toBe(true);
  });
  it("rejects unsuitable trial conditions", () => {
    for (const p of [{ shots: 6 }])
      expect(evaluate(session, { ...result, ...p }, profile)[2].status).toBe(
        "not-evaluated",
      );
  });
  it("separates annual counts and weapon groups", () => {
    const p = [...Array(3)].map((_, i) => ({
      ...session,
      id: crypto.randomUUID(),
      results: [{ ...result, id: crypto.randomUUID() }],
    }));
    const a = p.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      discipline: "application" as const,
      results: [
        {
          ...result,
          id: crypto.randomUUID(),
          type: "application" as const,
          shots: 6,
          hits: 6,
          target: "C30",
          seconds: 15,
        },
      ],
    }));
    const saved = [...p, ...a].flatMap((s) =>
      s.results.flatMap((r) =>
        evaluate(s, r, profile).map((a) => ({
          ...a,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        })),
      ),
    );
    expect(progress([...p, ...a], saved, 2026, "C", "gold").status).toBe("met");
    expect(
      progress([...p, ...a.slice(0, 2)], saved, 2026, "C", "gold").status,
    ).toBe("not-met");
    expect(
      progress(
        [...p, ...a.map((s) => ({ ...s, date: "2027-01-01" }))],
        saved,
        2026,
        "C",
        "gold",
      ).application,
    ).toBe(0);
    expect(progress([...p, ...a], saved, 2026, "A", "gold").precision).toBe(0);
  });
  it("selects versions by performance date with an exclusive end", () => {
    const v = {
      ...rules[0],
      id: "test-next",
      from: "2028-01-01",
      until: "2030-01-01",
      precision: {
        A: [33, 39, 44],
        B: [34, 40, 46],
        C: [35, 41, 47],
      } as (typeof rules)[0]["precision"],
    };
    expect(
      evaluate(session, result, profile, [...rules, v])[2].ruleVersion,
    ).toBe(rules[0].id);
    expect(
      evaluate({ ...session, date: "2028-01-01" }, result, profile, [
        ...rules,
        v,
      ])[2].status,
    ).toBe("not-met");
    expect(
      evaluate({ ...session, date: "2028-01-01" }, result, profile, [
        ...rules,
        v,
      ])[2].ruleVersion,
    ).toBe("test-next");
  });
  for (const d of disciplines)
    it(`records arithmetic for ${d.name} without invented awards`, () => {
      const s = {
        ...session,
        discipline: d.id,
        results: [
          {
            ...result,
            points: 20,
            hits: 4,
            figures: 2,
            seconds: 30,
            penaltyPoints: 2,
            penaltySeconds: 5,
          },
        ],
      };
      expect(summarize(s)).toEqual({
        points: 18,
        hits: 4,
        figures: 2,
        seconds: 35,
        shots: 5,
        x: 0,
      });
      if (!["precision", "application"].includes(d.id))
        expect(
          evaluate(s, s.results[0], profile).every(
            (a) => a.status === "not-evaluated",
          ),
        ).toBe(true);
    });
  it("catalog is complete and has no overlapping periods", () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const r of rules) {
      expect(r.source.startsWith("https://")).toBe(true);
      expect(r.from < r.until).toBe(true);
      expect(r.requiredCount).toBe(3);
    }
    for (let i = 1; i < rules.length; i++)
      expect(rules[i - 1].until <= rules[i].from).toBe(true);
  });
});
it("personal series need no supervisor, confirmation or signature", () => {
  const personal = { ...result, conditionsConfirmed: false, evidence: "" };
  expect(evaluate(session, personal, profile)[2].status).toBe("met");
  expect(evaluate(session, personal, profile)[2].input).toMatchObject({
    evaluatorVersion: 3,
  });
  expect(
    evaluate(
      { ...session, discipline: "application" },
      {
        ...personal,
        type: "application",
        shots: 6,
        hits: 6,
        target: "C30",
        seconds: 15,
      },
      profile,
    )[2].status,
  ).toBe("met");
  expect(evaluate(session, personal, profile, rules)[2].status).toBe("met");
});
it("checks all three levels for every combination of confirmation and evidence, including legacy callers", () => {
  for (const conditionsConfirmed of [true, false])
    for (const evidence of ["", "personal note"])
      for (const version of [1, 2] as const) {
        const evaluated = evaluate(
          session,
          { ...result, conditionsConfirmed, evidence },
          profile,
          rules,
        );
        expect(evaluated).toHaveLength(3);
        expect(evaluated.map((a) => a.status)).toEqual(["met", "met", "met"]);
      }
});
