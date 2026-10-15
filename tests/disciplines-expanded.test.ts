import { expect, it } from "vitest";
import { disciplines } from "../lib/disciplines";
import { sessionSchema, quickEntryInputSchema } from "../lib/models";
import { netPoints, hitFactor } from "../lib/result-metrics";
import { evaluate, summarize } from "../lib/rules/engine";
import { exportRecords, parseImport, csv } from "../lib/portability";
import { reviewSession } from "../lib/witness/model";
import { session, result, profile } from "./fixtures";
const spsf = [
  "precision",
  "field",
  "magnum-field",
  "magnum-precision",
  "rapid",
  "military",
  "national",
  "running",
  "ski",
  "air",
  "falling",
  "ppc",
];
it.each(spsf)(
  "can log SPSF discipline %s without requiring a medal calculation",
  (id) => {
    const sport = disciplines.find((d) => d.id === id)!;
    const r = {
      ...result,
      points: sport.kind === "points" ? 45 : undefined,
      hits: sport.kind === "points" ? undefined : 4,
      figures: sport.kind === "field" ? 3 : undefined,
    };
    const parsed = sessionSchema.parse({
      ...session,
      discipline: id,
      results: [r],
    });
    expect(parsed.discipline).toBe(id);
    if (id !== "precision")
      expect(
        evaluate(parsed, r, profile).every((a) => a.status === "not-evaluated"),
      ).toBe(true);
  },
);
it.each(
  disciplines.filter(
    (d) => d.id.startsWith("ipsc-") || ["dmr", "nordic-steel"].includes(d.id),
  ),
)(
  "logs timed event $id and retains metrics across import and witness review",
  (sport) => {
    const r = {
      ...result,
      seconds: undefined,
      points: 80,
      penaltyPoints: 20,
      elapsedSeconds: 12.34,
      matchPercent: 83.2,
      placement: 7,
      scoreText: "Test event detail",
    };
    const s = sessionSchema.parse({
      ...session,
      discipline: sport.id,
      seconds: null,
      results: [r],
    });
    const imported = parseImport(
      exportRecords({
        profile,
        firearms: [],
        sessions: [{ ...s, firearmId: null, firearmSnapshot: null }],
        assessments: [],
      }),
    );
    expect(imported.sessions[0].results[0]).toMatchObject(
      JSON.parse(JSON.stringify(r)),
    );
    expect(reviewSession(s, null).results[0]).toMatchObject(
      JSON.parse(JSON.stringify(r)),
    );
    expect(summarize(s).seconds).toBe(12.34);
    expect(csv([s])).toContain('"12.34"');
  },
);
it("keeps actual stage time separate from a shared time limit", () => {
  const s = sessionSchema.parse({
    ...session,
    discipline: "ipsc-rifle",
    seconds: 180,
    results: [{ ...result, elapsedSeconds: 15 }],
  });
  expect(s.seconds).toBe(180);
  expect(s.results[0].elapsedSeconds).toBe(15);
  expect(summarize(s).seconds).toBe(15);
});
it("rejects missing or invalid dynamic metrics, while accepting DNS with zero shots", () => {
  expect(() =>
    sessionSchema.parse({
      ...session,
      discipline: "ipsc-rifle",
      results: [{ ...result, elapsedSeconds: 0 }],
    }),
  ).toThrow();
  expect(() =>
    sessionSchema.parse({
      ...session,
      discipline: "ipsc-rifle",
      results: [{ ...result, elapsedSeconds: 1, matchPercent: 101 }],
    }),
  ).toThrow();
  expect(
    sessionSchema.parse({
      ...session,
      discipline: "ipsc-rifle",
      results: [
        { id: result.id, label: "DNS", type: "score", shots: 0, status: "dns" },
      ],
    }).results[0].status,
  ).toBe("dns");
});
it("clamps IPSC net points at zero and calculates personal HF without awarding medals", () => {
  const r = { ...result, points: 10, penaltyPoints: 20, elapsedSeconds: 4 };
  const s = sessionSchema.parse({
    ...session,
    discipline: "ipsc-handgun",
    results: [r],
  });
  expect(netPoints(r, s.discipline)).toBe(0);
  expect(hitFactor(r, s.discipline)).toBe(0);
  expect(hitFactor({ ...r, penaltyPoints: 0 }, s.discipline)).toBe(2.5);
  expect(hitFactor(r, "nordic-steel")).toBeUndefined();
  expect(
    evaluate(s, r, profile).every((a) => a.status === "not-evaluated"),
  ).toBe(true);
});
it("logs custom results and dry practice without counting live shots", () => {
  const r = {
    id: result.id,
    label: "Balance practice",
    type: "score",
    shots: 0,
    dryFire: true,
    elapsedSeconds: 600,
    scoreText: "Steady sight picture",
  };
  const s = sessionSchema.parse({
    ...session,
    discipline: "custom",
    program: "My own practice",
    seconds: null,
    results: [r],
  });
  expect(summarize(s).shots).toBe(0);
  expect(
    quickEntryInputSchema.parse({
      id: result.id,
      date: session.date,
      discipline: "custom",
      result: r,
      notes: "",
    }).result.dryFire,
  ).toBe(true);
  expect(() =>
    sessionSchema.parse({ ...s, discipline: "precision" }),
  ).toThrow();
  expect(() =>
    sessionSchema.parse({ ...s, results: [{ ...r, shots: 1 }] }),
  ).toThrow();
});
