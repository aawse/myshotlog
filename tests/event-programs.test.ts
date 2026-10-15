import { expect, it } from "vitest";
import {
  programs,
  eventPrograms,
  applyProgram,
  classFor,
  distanceText,
} from "../lib/events/programs";
import { sessionSchema, firearmSchema, seriesConditions } from "../lib/models";
import { disciplines } from "../lib/disciplines";
import { reviewSession } from "../lib/witness/model";
import { evaluate, summarize } from "../lib/rules/engine";
import { exportRecords, parseImport } from "../lib/portability";
import { session, firearm, profile } from "./fixtures";
it("offers at least one program for every sport, with unique IDs", () => {
  expect(new Set(programs.map((p) => p.id)).size).toBe(programs.length);
  for (const sport of disciplines)
    expect(eventPrograms(sport.id).length).toBeGreaterThan(0);
});
it.each(programs)(
  "creates valid, uniquely named results for $id",
  (program) => {
    const s = applyProgram(
      { ...session, discipline: program.discipline },
      program,
      "sv",
      firearm,
    );
    const kind = disciplines.find((d) => d.id === s.discipline)!.kind;
    const filled = {
      ...s,
      group: s.group || "Test class",
      program: s.program || "User-defined event",
      results: s.results.map((r) => ({
        ...r,
        ...(["dynamic", "time"].includes(kind) ? { elapsedSeconds: 2 } : {}),
      })),
    };
    expect(sessionSchema.parse(filled).results).toHaveLength(s.results.length);
    expect(new Set(s.results.map((r) => r.id)).size).toBe(s.results.length);
    expect(new Set(s.results.map((r) => r.label)).size).toBe(s.results.length);
    expect(s.firearmId).toBe(session.firearmId);
  },
);
it("sets 25 m and class C for .22 LR precision, regardless of a stale generic firearm group", () => {
  const f = { ...firearm, caliber: ".22 LR", group: "A" };
  const s = applyProgram(
    session,
    programs.find((p) => p.id === "precision-6")!,
    "sv",
    f,
  );
  expect(s.distance).toBe(25);
  expect(s.group).toBe("C");
  expect(s.results).toHaveLength(6);
  expect(
    s.results.every(
      (r) => r.shots === 5 && seriesConditions(s, r).distance === 25,
    ),
  ).toBe(true);
  expect(summarize(s).shots).toBe(30);
});
it.each([
  ["ppc-p1500", 150, 10],
  ["ppc-r1500", 150, 10],
  ["ppc-open60", 60, 4],
  ["ppc-ssap", 48, 4],
  ["ppc-sr275-5", 40, 4],
] as const)(
  "fills %s with %i shots across %i scored stages",
  (id, shots, count) => {
    const s = applyProgram(
      { ...session, discipline: "ppc" },
      programs.find((p) => p.id === id)!,
      "sv",
      { ...firearm, caliber: "9x19 mm", firearmType: "pistol" },
    );
    expect(s.results).toHaveLength(count);
    expect(summarize(s).shots).toBe(shots);
    expect(s.results.every((r) => r.stageDistanceUnit === "yd")).toBe(true);
    expect(s.results.every((r) => r.stageTarget === "ppc")).toBe(true);
    expect(s.results.map((r) => r.stageDistance)).toContain(25);
    expect(s.results.map((r) => r.stageDistance)).toContain(
      id.includes("1500") || id.includes("60") ? 50 : 3,
    );
  },
);
it("retains yard distances and time limits in witness snapshots and imports", () => {
  const s = applyProgram(
    { ...session, discipline: "ppc", firearmId: null, firearmSnapshot: null },
    programs.find((p) => p.id === "ppc-p1500")!,
    "en",
  );
  expect(distanceText(s.results[0])).toBe("7 yd");
  expect(seriesConditions(s, s.results[0]).distance).toBeCloseTo(6.4008);
  expect(reviewSession(s, null).results[0]).toMatchObject({
    stageDistance: 7,
    stageDistanceUnit: "yd",
    seconds: 20,
  });
  const imported = parseImport(
    exportRecords({ profile, firearms: [], sessions: [s], assessments: [] }),
  );
  expect(imported.sessions[0].results).toEqual(s.results);
  const metres = applyProgram(
    s,
    programs.find((p) => p.id === "ppc-p1500")!,
    "en",
    undefined,
    { unit: "m" },
  );
  expect(distanceText(metres.results[0])).toBe("7 m");
});
it("uses optic-aware PPC and PCC classes, and requires review for restricted optic classes", () => {
  const f = firearmSchema.parse({
    ...firearm,
    hasOptic: true,
    firearmType: "pistol",
    classDefaults: { ppc: "P1500", "ipsc-handgun": "Production Optics" },
  });
  expect(classFor({ ...session, discipline: "ppc" }, f)).toBe("P1500 Optical");
  expect(classFor({ ...session, discipline: "ipsc-pcc" }, f)).toBe("Optics");
  expect(classFor({ ...session, discipline: "ipsc-handgun" }, f)).toBe(
    "Production Optics",
  );
  expect(
    classFor({ ...session, discipline: "ppc", presetId: "ppc-dist-pistol" }, f),
  ).toBe("");
  expect(classFor(session, f)).toBe("");
});
it("fills military and national programs with their distinct phases and limits", () => {
  const military = applyProgram(
    { ...session, discipline: "military" },
    programs.find((p) => p.id === "military-12")!,
    "sv",
    firearm,
  );
  expect(military.results.map((r) => r.stageTimeLimit)).toEqual([
    10, 10, 10, 10, 8, 8, 8, 8, 6, 6, 6, 6,
  ]);
  const national = applyProgram(
    { ...session, discipline: "national" },
    programs.find((p) => p.id === "national-12")!,
    "sv",
    firearm,
  );
  expect(national.results.slice(-4).map((r) => r.stageTimeLimit)).toEqual([
    18, 16, 14, 12,
  ]);
  expect(summarize(national).shots).toBe(60);
  expect(national.results[4].stageTarget).toBe("rapid25");
});
it("logs Falling Target hits without requiring a time", () => {
  const s = applyProgram(
    { ...session, discipline: "falling" },
    programs.find((p) => p.id === "falling-5")!,
    "sv",
    firearm,
  );
  expect(sessionSchema.parse(s).results).toHaveLength(5);
});
it("rejects a different sport or firearm on an individual result", () => {
  expect(() =>
    sessionSchema.parse({
      ...session,
      results: [{ ...session.results[0], discipline: "ppc" }],
    }),
  ).toThrow();
  expect(() =>
    sessionSchema.parse({
      ...session,
      results: [{ ...session.results[0], firearmId: firearm.id }],
    }),
  ).toThrow();
});
it("applying a program is pure and leaves saved results and assessments untouched", () => {
  const before = structuredClone(session);
  const evaluation = evaluate(session, session.results[0], profile);
  applyProgram(
    session,
    programs.find((p) => p.id === "precision-6")!,
    "en",
    firearm,
  );
  expect(session).toEqual(before);
  expect(evaluate(session, session.results[0], profile)).toEqual(evaluation);
});
