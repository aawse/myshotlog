import { expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { synchronize, SyncConflict } from "../lib/sync/server";
import {
  targetsFor,
  applyOperation,
  emptyRecords,
  type Operation,
} from "../lib/sync/model";
import { GitJournalStore, InvalidRecord } from "../lib/git-database/store";
import {
  DatabaseConflict,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "../lib/git-database/types";
import { firearm, session, profile } from "./fixtures";
const owner = "20000000-0000-4000-8000-000000000001",
  prefix = "myshotlog/v1";
class MemoryDatabase implements GitDatabase {
  files = new Map<string, string>();
  count = 0;
  publishCalls = 0;
  commits: EntryCommit[] = [];
  async snapshot(path: string) {
    return {
      head: this.count ? this.count.toString(16).padStart(40, "0") : null,
      files: new Map([...this.files].filter(([p]) => p.startsWith(path + "/"))),
    };
  }
  async publish(snapshot: GitSnapshot, entries: EntryCommit[]) {
    if (
      snapshot.head !==
      (this.count ? this.count.toString(16).padStart(40, "0") : null)
    )
      throw new DatabaseConflict();
    this.publishCalls++;
    for (const entry of entries) {
      this.count++;
      this.commits.push(entry);
      for (const change of entry.changes)
        if (change.content === null) this.files.delete(change.path);
        else this.files.set(change.path, change.content);
    }
    return {
      head: this.count.toString(16).padStart(40, "0"),
      commits: entries.map(() => this.count.toString(16).padStart(40, "0")),
    };
  }
}
function operation(
  action: Operation["action"],
  payload: unknown,
  data = emptyRecords(),
): Operation {
  return {
    id: crypto.randomUUID(),
    action,
    payload,
    photos: [],
    recording: {
      recordedAt: "2026-10-14T12:00:00Z",
      birthDate: null,
      birthYear: 1990,
    },
    base: targetsFor(action, payload, data),
  };
}
it("batches validated entries into one publication while retaining one commit per entry", async () => {
  const db = new MemoryDatabase();
  const first = operation("firearm", firearm);
  const second = operation(
    "session",
    session,
    applyOperation(emptyRecords(), first),
  );
  const result = await synchronize(db, owner, prefix, [first, second]);
  expect(db.publishCalls).toBe(1);
  expect(db.commits).toHaveLength(2);
  expect(result.acknowledged).toEqual([first.id, second.id]);
  expect(result.records.sessions[0].firearmSnapshot?.model).toBe(firearm.model);
  expect(result.records.assessments).toHaveLength(3);
  expect(
    db.commits.every((e) =>
      e.changes.some((c) => c.path.endsWith("sync-receipts.json")),
    ),
  ).toBe(true);
});
it("retries after lost responses without duplicating commits, including later edits to the same entry", async () => {
  const db = new MemoryDatabase();
  const first = operation("firearm", firearm);
  await synchronize(db, owner, prefix, [first]);
  const current = await new GitJournalStore(db, owner).records();
  const second = operation("firearm", { ...firearm, model: "Edited" }, current);
  await synchronize(db, owner, prefix, [second]);
  const result = await synchronize(db, owner, prefix, [first]);
  expect(db.commits).toHaveLength(2);
  expect(result.records.firearms[0].model).toBe("Edited");
  expect(result.acknowledged).toEqual([first.id]);
  await expect(
    synchronize(db, owner, prefix, [
      { ...first, payload: { ...firearm, model: "Different request" } },
    ]),
  ).rejects.toBeInstanceOf(InvalidRecord);
});
it("does not partially publish a batch when a later operation conflicts", async () => {
  const db = new MemoryDatabase(),
    store = new GitJournalStore(db, owner);
  await store.mutate("firearm", firearm);
  const pending = operation(
    "firearm",
    { ...firearm, model: "Local" },
    emptyRecords(),
  );
  const before = db.count;
  await expect(
    synchronize(db, owner, prefix, [operation("profile", profile), pending]),
  ).rejects.toBeInstanceOf(SyncConflict);
  expect(db.count).toBe(before);
  expect((await store.records()).profile.displayName).toBe("");
});
it("allows unrelated remote changes without overwriting them", async () => {
  const db = new MemoryDatabase(),
    store = new GitJournalStore(db, owner);
  const pending = operation("firearm", firearm);
  await store.mutate("profile", profile);
  await synchronize(db, owner, prefix, [pending]);
  expect((await store.records()).profile).toEqual(profile);
});
it("preserves recording time and captured birth information during delayed synchronization", async () => {
  const db = new MemoryDatabase(),
    store = new GitJournalStore(db, owner);
  await store.mutate("profile", {
    ...profile,
    birthDate: "2000-01-01",
    birthYear: 2000,
  });
  await store.mutate("firearm", firearm);
  const state = await store.records(),
    op = operation("session", session, state);
  op.recording = {
    recordedAt: "2026-10-13T13:00:00Z",
    birthDate: "1960-01-01",
    birthYear: 1960,
  };
  await synchronize(db, owner, prefix, [op]);
  const data = await store.records();
  expect(data.assessments[0].input).toMatchObject({
    birthDate: "1960-01-01",
    birthYear: 1960,
  });
  expect(data.assessments[0].createdAt).toBe(op.recording.recordedAt);
  expect(data.profile.birthYear).toBe(2000);
});
it("handles a queued create followed by an edit in order", async () => {
  const db = new MemoryDatabase(),
    store = new GitJournalStore(db, owner);
  await store.mutate("firearm", firearm);
  const data = await store.records(),
    first = operation("session", session, data);
  const second = operation(
    "session",
    { ...session, revision: 2, notes: "Second edit" },
    applyOperation(data, first),
  );
  const result = await synchronize(db, owner, prefix, [first, second]);
  expect(result.records.sessions[0]).toMatchObject({
    revision: 2,
    notes: "Second edit",
  });
  expect(result.acknowledged).toHaveLength(2);
});
it("rejects stale deletions and invalid payloads without writing receipts", async () => {
  const db = new MemoryDatabase(),
    store = new GitJournalStore(db, owner);
  await store.mutate("firearm", firearm);
  await store.mutate("session", session);
  const old = await store.records();
  const deletion = operation("delete-session", { id: session.id }, old);
  await store.mutate("session", { ...session, revision: 2, notes: "remote" });
  const before = db.count;
  await expect(
    synchronize(db, owner, prefix, [deletion]),
  ).rejects.toBeInstanceOf(SyncConflict);
  await expect(
    synchronize(db, owner, prefix, [
      { ...operation("firearm", firearm), payload: { ...firearm, make: "" } },
    ]),
  ).rejects.toThrow();
  expect(db.count).toBe(before);
});
it("rebuilds the plan after a concurrent branch update", async () => {
  const db = new MemoryDatabase();
  const publish = db.publish.bind(db);
  let race = true;
  db.publish = async (snapshot, entries) => {
    if (race) {
      race = false;
      await publish(snapshot, [
        {
          message: "unrelated",
          changes: [{ path: prefix + "/other.json", content: "{}" }],
        },
      ]);
      throw new DatabaseConflict();
    }
    return publish(snapshot, entries);
  };
  const op = operation("firearm", firearm);
  const result = await synchronize(db, owner, prefix, [op]);
  expect(result.records.firearms).toHaveLength(1);
  expect(db.commits).toHaveLength(2);
});
it("keeps journals and receipts scoped to the authenticated owner", async () => {
  const db = new MemoryDatabase();
  await synchronize(db, owner, prefix, [operation("firearm", firearm)]);
  const other = new GitJournalStore(db, "20000000-0000-4000-8000-000000000002");
  expect((await other.records()).firearms).toEqual([]);
});
