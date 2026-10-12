import { it, expect } from "vitest";
import { parseImport, exportRecords, csv } from "../lib/portability";
import { session, result, profile, firearm } from "./fixtures";
import { sessionSchema } from "../lib/models";
const records = {
  profile,
  firearms: [firearm],
  sessions: [session],
  assessments: [],
};
it("JSON round trip preserves raw data and snapshots", () => {
  const restored = parseImport(
    JSON.parse(JSON.stringify(exportRecords(records))),
  );
  expect(restored.sessions).toEqual(records.sessions);
  expect(restored.firearms[0].serial).toBe("TEST-SERIAL-SECRET-98431");
});
it("rejects unknown version and owner injection", () => {
  expect(() =>
    parseImport({ ...exportRecords(records), version: 2 }),
  ).toThrow();
  expect(() =>
    parseImport({ ...exportRecords(records), user_id: "other" }),
  ).toThrow();
  expect(() =>
    parseImport({
      ...exportRecords(records),
      sessions: [{ ...session, user_id: "other" }],
    }),
  ).toThrow();
});
it("rejects duplicates, orphan references, impossible hits and invalid dates", () => {
  expect(() =>
    parseImport({ ...exportRecords(records), sessions: [session, session] }),
  ).toThrow();
  expect(() =>
    parseImport({ ...exportRecords(records), firearms: [] }),
  ).toThrow();
  expect(() =>
    sessionSchema.parse({ ...session, date: "2026-02-30" }),
  ).toThrow();
  expect(() =>
    sessionSchema.parse({ ...session, results: [{ ...result, hits: 6 }] }),
  ).toThrow();
});
it("CSV quotes newlines and neutralizes formula injection without sensitive fields", () => {
  const content = csv([
    {
      ...session,
      location: '=HYPERLINK("x")',
      notes: "sensitive",
      results: [{ ...result, label: "line\nline" }],
    },
  ]);
  expect(content).toContain("'=HYPERLINK");
  expect(content).toContain("line\nline");
  expect(content).not.toContain("TEST-SERIAL-SECRET-98431");
  expect(content).not.toContain("sensitive");
});
it("archived firearm changes do not change captured historical snapshot", () => {
  const exported = exportRecords({
    ...records,
    firearms: [{ ...firearm, archived: true, model: "Changed", group: "A" }],
  });
  expect(parseImport(exported).sessions[0].firearmSnapshot?.model).toBe("Test");
  expect(parseImport(exported).sessions[0].group).toBe("C");
});

it("localizes CSV headers while preserving user-entered values", () => {
  const content = csv(
    [
      {
        ...session,
        program: "Poäng",
        location: "Plats",
        results: [{ ...result, label: "Serie" }],
      },
    ],
    "en",
  );
  expect(content).toContain('"Date";"Discipline";"Program"');
  expect(content).toContain('"Poäng"');
  expect(content).toContain('"Plats"');
  expect(content).toContain('"Serie"');
});
