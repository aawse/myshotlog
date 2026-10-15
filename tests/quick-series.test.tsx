import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GitJournalStore,
  InvalidRecord,
  RecordNotFound,
} from "../lib/git-database/store";
import {
  DatabaseConflict,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "../lib/git-database/types";
import { exportRecords, parseImport } from "../lib/portability";
import { quickEntryInputSchema } from "../lib/models";
import { profile, session } from "./fixtures";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
}));
import { QuickSeries } from "../components/quick-series";
import { SessionForm } from "../components/session-form";
const owner = "20000000-0000-4000-8000-000000000001";
class MemoryDatabase implements GitDatabase {
  files = new Map<string, string>();
  commits: EntryCommit[] = [];
  revision = 0;
  fail = false;
  async snapshot(prefix: string): Promise<GitSnapshot> {
    return {
      head: String(this.revision),
      files: new Map(
        [...this.files].filter(([path]) => path.startsWith(prefix)),
      ),
    };
  }
  async publish(snapshot: GitSnapshot, entries: EntryCommit[]) {
    if (this.fail) {
      this.fail = false;
      throw new DatabaseConflict();
    }
    if (snapshot.head !== String(this.revision)) throw new DatabaseConflict();
    for (const entry of entries)
      for (const change of entry.changes) {
        if (change.content === null) this.files.delete(change.path);
        else this.files.set(change.path, change.content);
      }
    this.commits.push(...entries);
    this.revision += entries.length;
    return {
      head: String(this.revision),
      commits: entries.map((_, i) => String(this.revision - i)),
    };
  }
}
function setup() {
  const db = new MemoryDatabase();
  return { db, store: new GitJournalStore(db, owner) };
}
function quick(points = 46) {
  const id = crypto.randomUUID();
  return {
    id,
    date: session.date,
    discipline: "precision" as const,
    result: { id, label: "Serie", type: "score" as const, shots: 5, points },
    notes: "Lugn avfyrning",
  };
}
const pass = { ...session, firearmId: null, firearmSnapshot: null };
it("saves each unlinked series in one commit and makes retries idempotent", async () => {
  const { db, store } = setup(),
    q = quick();
  await store.mutate("quick-entry", q);
  await store.mutate("quick-entry", q);
  expect(db.commits).toHaveLength(1);
  expect((await store.records()).quickEntries).toHaveLength(1);
  await expect(
    store.mutate("quick-entry", { ...q, notes: "Changed" }),
  ).rejects.toBeInstanceOf(DatabaseConflict);
  const other = new GitJournalStore(db, "20000000-0000-4000-8000-000000000002");
  expect((await other.records()).quickEntries).toEqual([]);
});
it("atomically links multiple series without duplication after a conflict", async () => {
  const { db, store } = setup(),
    a = quick(),
    b = quick(45);
  await store.mutate("session", pass);
  await store.mutate("quick-entry", a);
  await store.mutate("quick-entry", b);
  db.fail = true;
  await store.mutate("attach-quick", {
    ids: [a.id, b.id],
    sessionId: pass.id,
    revision: 1,
  });
  const data = await store.records();
  expect(data.quickEntries).toEqual([]);
  expect(data.sessions[0].results).toHaveLength(3);
  expect(data.sessions[0].revision).toBe(2);
  expect(data.sessions[0].notes).toContain(a.notes);
  expect(
    data.assessments.filter((a) => a.status === "met").length,
  ).toBeGreaterThan(0);
  expect(db.commits.at(-3)?.changes[0].path).toContain("sessions/");
  await expect(
    store.mutate("attach-quick", {
      ids: [a.id],
      sessionId: pass.id,
      revision: 2,
    }),
  ).rejects.toBeInstanceOf(RecordNotFound);
});
it("keeps unlinked entries intact for invalid dates, revisions and missing sessions", async () => {
  const { store } = setup(),
    q = quick();
  await store.mutate("session", pass);
  await store.mutate("quick-entry", { ...q, date: "2026-10-09" });
  await expect(
    store.mutate("attach-quick", {
      ids: [q.id],
      sessionId: pass.id,
      revision: 1,
    }),
  ).rejects.toBeInstanceOf(InvalidRecord);
  await expect(
    store.mutate("attach-quick", {
      ids: [q.id],
      sessionId: pass.id,
      revision: 0,
    }),
  ).rejects.toBeInstanceOf(DatabaseConflict);
  expect((await store.records()).quickEntries).toHaveLength(1);
  expect((await store.records()).sessions[0].results).toHaveLength(1);
});
it("creates a new session using quick series and captures birth information at quick save", async () => {
  const { store } = setup(),
    q = quick(45);
  await store.mutate("profile", { ...profile, birthYear: 1960 });
  await store.mutate("quick-entry", q);
  const captured = (await store.records()).quickEntries![0];
  expect(captured.ruleVersion).toBeTruthy();
  await store.mutate("profile", { ...profile, birthYear: 1990 });
  await store.mutate("session-with-quick", {
    ids: [q.id],
    session: {
      ...pass,
      results: [q.result],
      seconds: 300,
      distance: 25,
      target: "precision25",
    },
  });
  const data = await store.records();
  expect(
    data.assessments.every(
      (a) => (a.input as { birthYear: number }).birthYear === 1960,
    ),
  ).toBe(true);
  expect(data.quickEntries).toEqual([]);
  expect(data.sessions[0].results[0].seconds).toBeUndefined();
});
it("includes unlinked series and captured inputs in JSON backup and restore", async () => {
  const { store } = setup(),
    q = quick();
  await store.mutate("quick-entry", q);
  const backup = parseImport(exportRecords(await store.records()));
  const next = setup();
  await next.store.mutate("import", backup);
  expect((await next.store.records()).quickEntries).toEqual(
    backup.quickEntries,
  );
  await next.store.mutate("delete-records", { confirm: "RADERA" });
  expect((await next.store.records()).quickEntries).toEqual([]);
});
it("rejects incomplete results and series-specific shooting conditions", () => {
  const q = quick();
  expect(
    quickEntryInputSchema.safeParse({
      ...q,
      result: { ...q.result, points: undefined },
    }).success,
  ).toBe(false);
  expect(
    quickEntryInputSchema.safeParse({
      ...q,
      result: { ...q.result, points: 51 },
    }).success,
  ).toBe(false);
  expect(
    quickEntryInputSchema.safeParse({
      ...q,
      result: { ...q.result, seconds: 300 },
    }).success,
  ).toBe(false);
});
it("renders numeric quick entry controls and prefills a new pass without exposing birth information", () => {
  const q = quick();
  const html = renderToStaticMarkup(
    <QuickSeries
      today={session.date}
      sessions={[]}
      entries={[{ ...q, recordedAt: "2026-10-10T12:00:00Z" }]}
    />,
  );
  expect(html).toContain('inputMode="decimal"');
  expect(html).toContain("Okopplade serier");
  expect(html.match(/Välj skjutprogram/g)).toHaveLength(1);
  const form = renderToStaticMarkup(
    <SessionForm firearms={[]} quickEntries={[q]} />,
  );
  expect(form).toContain('value="46"');
  expect(form).toContain('value="2026-10-10"');
  expect(form).toContain("snabbserier kopplas");
});
it("preserves PPC program identity and stage conditions, including idempotent quick saves", async () => {
  const { store, db } = setup();
  const id = crypto.randomUUID();
  const q = {
    id,
    date: session.date,
    discipline: "ppc",
    presetId: "ppc-p1500",
    notes: "",
    result: {
      id,
      label: "Match 1 · etapp 1 · 7 yd",
      type: "score",
      shots: 12,
      points: 115,
      stageDistance: 7,
      stageDistanceUnit: "yd",
      stageTimeLimit: 20,
      stageTarget: "ppc",
    },
  };
  await store.mutate("quick-entry", q);
  await store.mutate("quick-entry", q);
  expect(db.commits).toHaveLength(1);
  await store.mutate("session-with-quick", {
    ids: [id],
    session: {
      ...pass,
      discipline: "ppc",
      presetId: q.presetId,
      program: "P1500",
      group: "P1500",
      seconds: null,
      distance: null,
      target: "ppc",
      results: [q.result],
    },
  });
  const saved = (await store.records()).sessions[0];
  expect(saved.presetId).toBe("ppc-p1500");
  expect(saved.results[0]).toMatchObject({
    stageDistance: 7,
    stageDistanceUnit: "yd",
    stageTimeLimit: 20,
    stageTarget: "ppc",
  });
});
it("leaves quick entries intact when a different event program is selected", async () => {
  const { store } = setup(),
    q = { ...quick(), presetId: "precision-6" };
  await store.mutate("quick-entry", q);
  await expect(
    store.mutate("session-with-quick", {
      ids: [q.id],
      session: { ...pass, presetId: "precision-7", results: [q.result] },
    }),
  ).rejects.toBeInstanceOf(InvalidRecord);
  expect((await store.records()).quickEntries).toHaveLength(1);
});

it("captures an IPSC rule reference rather than an SPSF assessment version", async () => {
  const { store } = setup();
  const q = { ...quick(), discipline: "ipsc-handgun" };
  await store.mutate("quick-entry", q);
  expect((await store.records()).quickEntries![0].ruleVersion).toBe(
    "IPSC 2026",
  );
});
