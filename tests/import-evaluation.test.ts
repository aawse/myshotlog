import { it, expect, vi } from "vitest";
vi.mock("../lib/rules/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/rules/catalog")>();
  return {
    ...actual,
    rules: [
      ...actual.rules,
      {
        ...actual.rules[0],
        id: "future-test",
        from: "2028-01-01",
        until: "2030-01-01",
        precision: { A: [0, 0, 0], B: [0, 0, 0], C: [0, 0, 0] },
      },
    ],
  };
});
import { GitJournalStore } from "../lib/git-database/store";
import { exportRecords } from "../lib/portability";
import { profile, firearm, session, result } from "./fixtures";
import type { GitDatabase } from "../lib/git-database/types";
function database() {
  const files = new Map<string, string>();
  const provider: GitDatabase = {
    async snapshot(prefix) {
      return {
        head: null,
        files: new Map(
          [...files].filter(([path]) => path.startsWith(prefix + "/")),
        ),
      };
    },
    async publish(_snapshot, entries) {
      for (const entry of entries)
        for (const change of entry.changes) {
          if (change.content === null) files.delete(change.path);
          else files.set(change.path, change.content);
        }
      return { head: null, commits: entries.map(() => crypto.randomUUID()) };
    },
  };
  return { files, provider };
}
const owner = "20000000-0000-4000-8000-000000000001";
it("evaluates imports with the session-date rules and discards legacy conclusions", async () => {
  const { files, provider } = database();
  const store = new GitJournalStore(provider, owner);
  const sessions = [
    session,
    { ...session, id: crypto.randomUUID(), date: "2028-01-01" },
    { ...session, id: crypto.randomUUID(), date: "2025-12-31" },
  ].map((s) => ({ ...s, results: [{ ...result, points: 40 }] }));
  const legacy = {
    format: "skytte",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    firearms: [firearm],
    sessions,
    assessments: sessions.map((s) => ({
      id: crypto.randomUUID(),
      sessionId: s.id,
      resultId: result.id,
      revision: 1,
      ruleVersion: "forged",
      level: "gold",
      status: "met",
      source: "forged",
      reason: "forged",
      createdAt: new Date().toISOString(),
      input: {
        birthDate: null,
        birthYear: 1990,
        ruleSnapshot: { precision: { C: [0, 0, 0] } },
      },
    })),
  };
  await store.mutate("import", legacy);
  const stored = sessions.map((s) =>
    JSON.parse(files.get(`myshotlog/v1/users/${owner}/sessions/${s.id}.json`)!),
  );
  expect(stored[0].assessments[2]).toMatchObject({ status: "not-met" });
  expect(stored[0].assessments[2].ruleVersion).not.toBe("future-test");
  expect(stored[1].assessments[2]).toMatchObject({
    status: "met",
    ruleVersion: "future-test",
  });
  expect(stored[2].assessments[2]).toMatchObject({
    status: "not-evaluated",
    ruleVersion: "unsupported",
  });
  expect(JSON.stringify(stored)).not.toContain("forged");
  const before = new Map(files);
  expect((await store.mutate("import", legacy)).imported).toBe(0);
  expect(files).toEqual(before);
});
it("preserves recorded age and unknown birth data despite a corrected destination profile", async () => {
  const first = database(),
    store = new GitJournalStore(first.provider, owner);
  await store.mutate("profile", {
    ...profile,
    birthDate: "1960-02-03",
    birthYear: 1960,
  });
  await store.mutate("firearm", firearm);
  await store.mutate("session", {
    ...session,
    results: [{ ...result, points: 44 }],
  });
  await store.mutate("profile", profile);
  const backup = exportRecords(await store.records());
  expect(backup.recordingContexts[0].birthYear).toBe(1960);
  const destination = database(),
    target = new GitJournalStore(destination.provider, owner);
  await target.mutate("profile", profile);
  await target.mutate("import", backup);
  expect((await target.records()).assessments[2].status).toBe("met");
  const unknown = {
    ...backup,
    sessions: [{ ...backup.sessions[0], id: crypto.randomUUID() }],
  };
  unknown.recordingContexts = [
    {
      ...backup.recordingContexts[0],
      sessionId: unknown.sessions[0].id,
      id: unknown.sessions[0].id + ":" + result.id,
      birthDate: null,
      birthYear: null,
    },
  ];
  await target.mutate("import", unknown);
  await target.mutate("profile", { ...profile, birthYear: 1960 });
  expect(
    (await target.records()).assessments.find(
      (a) => a.sessionId === unknown.sessions[0].id && a.level === "gold",
    )?.status,
  ).toBe("not-met");
});
