import { it, expect, vi } from "vitest";
import { ReadCachedDatabase } from "../lib/git-database/read-cache";
import { GitJournalStore } from "../lib/git-database/store";
import {
  DatabaseConflict,
  type GitDatabase,
  type GitSnapshot,
} from "../lib/git-database/types";
import { profile, session, firearm } from "./fixtures";
function fixture(ttl = 15000, bytes = 1024 * 1024, count = 64) {
  let now = 0,
    head = 0;
  const files = new Map<string, string>();
  const source = {
    snapshot: vi.fn(
      async (prefix: string): Promise<GitSnapshot> => ({
        head: String(head),
        files: new Map([...files].filter(([p]) => p.startsWith(prefix + "/"))),
      }),
    ),
    publish: vi.fn<GitDatabase["publish"]>(async (_snapshot, entries) => {
      for (const entry of entries)
        for (const change of entry.changes)
          if (change.content === null) files.delete(change.path);
          else files.set(change.path, change.content);
      return { head: String(++head), commits: entries.map(() => String(head)) };
    }),
  };
  return {
    files,
    source,
    cache: new ReadCachedDatabase(source, ttl, bytes, count, () => now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}
it("reuses and coalesces scoped reads, returns independent maps, and expires without stale fallback", async () => {
  const { files, source, cache, advance } = fixture();
  files.set("users/one/profile.json", "old");
  files.set("users/two/profile.json", "other");
  const reads = await Promise.all([
    cache.readSnapshot("users/one"),
    cache.readSnapshot("users/one"),
  ]);
  expect(source.snapshot).toHaveBeenCalledTimes(1);
  (reads[0].files as Map<string, string>).clear();
  expect(
    (await cache.readSnapshot("users/one")).files.get("users/one/profile.json"),
  ).toBe("old");
  expect(
    (await cache.readSnapshot("users/two")).files.has("users/one/profile.json"),
  ).toBe(false);
  files.set("users/one/profile.json", "external change");
  advance(15000);
  expect(
    (await cache.readSnapshot("users/one")).files.get("users/one/profile.json"),
  ).toBe("external change");
  advance(15000);
  source.snapshot.mockRejectedValueOnce(new Error("offline"));
  await expect(cache.readSnapshot("users/one")).rejects.toThrow("offline");
  expect((await cache.readSnapshot("users/one")).files.size).toBe(1);
});
it("invalidates overlapping journal/photo reads while leaving other users and security-independent reads cached", async () => {
  const { cache, source } = fixture();
  for (const prefix of [
    "users/one",
    "users/two",
    "photos/users/one",
    "photos/users/one/hash",
  ])
    await cache.readSnapshot(prefix);
  const snapshot = await cache.snapshot("users/one");
  await cache.publish(snapshot, [
    {
      message: "rate counter",
      changes: [{ path: "security/state.json", content: "{}" }],
    },
  ]);
  await cache.readSnapshot("users/one");
  expect(source.snapshot).toHaveBeenCalledTimes(5);
  await cache.publish(snapshot, [
    {
      message: "save",
      changes: [
        { path: "users/one/profile.json", content: "new" },
        { path: "photos/users/one/hash/image.json", content: "photo" },
      ],
    },
  ]);
  expect(
    (await cache.readSnapshot("users/one")).files.get("users/one/profile.json"),
  ).toBe("new");
  expect((await cache.readSnapshot("photos/users/one")).files.size).toBe(1);
  expect((await cache.readSnapshot("photos/users/one/hash")).files.size).toBe(
    1,
  );
  await cache.readSnapshot("users/two");
  expect(source.snapshot).toHaveBeenCalledTimes(8);
  source.publish.mockRejectedValueOnce(new DatabaseConflict());
  await expect(
    cache.publish(snapshot, [
      {
        message: "conflict",
        changes: [{ path: "users/one/profile.json", content: "lost" }],
      },
    ]),
  ).rejects.toThrow(DatabaseConflict);
  await cache.readSnapshot("users/one");
  expect(source.snapshot).toHaveBeenCalledTimes(9);
});
it("does not let an older in-flight read repopulate the cache after a write", async () => {
  const { cache, source } = fixture();
  let complete!: (snapshot: GitSnapshot) => void;
  source.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = cache.readSnapshot("users/one");
  await Promise.resolve();
  await cache.publish({ head: "0", files: new Map() }, [
    {
      message: "save",
      changes: [{ path: "users/one/profile.json", content: "new" }],
    },
  ]);
  await cache.readSnapshot("users/one");
  complete({ head: "0", files: new Map([["users/one/profile.json", "old"]]) });
  await pending;
  expect(
    (await cache.readSnapshot("users/one")).files.get("users/one/profile.json"),
  ).toBe("new");
  expect(source.snapshot).toHaveBeenCalledTimes(2);
});
it("bounds retained data and entries and supports disabling caching", async () => {
  const { cache, files, source } = fixture(15000, 200, 2);
  for (const name of ["a", "b", "c"]) files.set(name + "/data", "value");
  await cache.readSnapshot("a");
  await cache.readSnapshot("b");
  await cache.readSnapshot("a");
  await cache.readSnapshot("c");
  await cache.readSnapshot("a");
  expect(source.snapshot).toHaveBeenCalledTimes(3);
  await cache.readSnapshot("b");
  expect(source.snapshot).toHaveBeenCalledTimes(4);
  files.set("large/data", "x".repeat(300));
  await cache.readSnapshot("large");
  await cache.readSnapshot("large");
  expect(source.snapshot).toHaveBeenCalledTimes(6);
  const disabled = new ReadCachedDatabase(source, 0);
  await disabled.readSnapshot("a");
  await disabled.readSnapshot("a");
  expect(source.snapshot).toHaveBeenCalledTimes(8);
});
it("always uses fresh transaction snapshots even with a warm journal cache", async () => {
  const { cache, files, source } = fixture();
  const owner = "20000000-0000-4000-8000-000000000001",
    store = new GitJournalStore(cache, owner);
  await store.mutate("profile", profile);
  await store.mutate("firearm", firearm);
  await store.mutate("session", session);
  await store.records();
  source.snapshot.mockClear();
  await store.records();
  expect(source.snapshot).not.toHaveBeenCalled();
  const path = `myshotlog/v1/users/${owner}/sessions/${session.id}.json`,
    external = JSON.parse(files.get(path)!);
  external.entry.revision = 2;
  files.set(path, JSON.stringify(external));
  await expect(
    store.mutate("session", { ...session, revision: 2 }),
  ).rejects.toThrow(DatabaseConflict);
  expect(source.snapshot).toHaveBeenCalledTimes(1);
  // A valid later revision saves successfully and immediately invalidates the display cache.
  await store.mutate("session", { ...session, revision: 3 });
  expect((await store.records()).sessions[0].revision).toBe(3);
});

it("evicts entries when their combined byte size reaches the memory bound", async () => {
  const { files, source, cache } = fixture(15000, 15);
  files.set("a/data", "value");
  files.set("b/data", "value");
  await cache.readSnapshot("a");
  await cache.readSnapshot("b");
  await cache.readSnapshot("a");
  expect(source.snapshot).toHaveBeenCalledTimes(3);
});
it("invalidates reads started while a publication is in progress", async () => {
  const { files, source, cache } = fixture();
  files.set("users/one/profile.json", "old");
  let complete!: () => void;
  source.publish.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = () => {
          files.set("users/one/profile.json", "new");
          resolve({ head: "new", commits: ["new"] });
        };
      }),
  );
  const publishing = cache.publish({ head: null, files: new Map() }, [
    {
      message: "save",
      changes: [{ path: "users/one/profile.json", content: "new" }],
    },
  ]);
  expect(
    (await cache.readSnapshot("users/one")).files.get("users/one/profile.json"),
  ).toBe("old");
  complete();
  await publishing;
  expect(
    (await cache.readSnapshot("users/one")).files.get("users/one/profile.json"),
  ).toBe("new");
});
