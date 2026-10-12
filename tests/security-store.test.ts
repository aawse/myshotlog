import { it, expect, vi } from "vitest";
import {
  GitSecurityStore,
  InvalidOAuthFlow,
  RateLimited,
} from "../lib/auth/security-store";
import {
  DatabaseConflict,
  DatabaseUnavailable,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "../lib/git-database/types";
function fixture() {
  let head = 0,
    now = 1000;
  const files = new Map<string, string>([
    ["journal/users/owner/profile.json", "unchanged"],
  ]);
  const db: GitDatabase = {
    snapshot: vi.fn(async (prefix: string) => ({
      head: String(head),
      files: new Map(
        [...files].filter(([path]) => path.startsWith(prefix + "/")),
      ),
    })),
    publish: vi.fn(async (snapshot: GitSnapshot, entries: EntryCommit[]) => {
      if (snapshot.head !== String(head)) throw new DatabaseConflict();
      for (const entry of entries)
        for (const change of entry.changes) {
          if (change.content === null) files.delete(change.path);
          else files.set(change.path, change.content);
        }
      head++;
      return { head: String(head), commits: [String(head)] };
    }),
  };
  const instance = () =>
    new GitSecurityStore(
      db,
      "journal/security/test",
      "s".repeat(32),
      () => now,
    );
  return {
    db,
    files,
    instance,
    advance: (seconds: number) => {
      now += seconds;
    },
  };
}
it("revokes sessions across independent instances and rejects unknown/expired sessions", async () => {
  const f = fixture(),
    a = f.instance(),
    b = f.instance();
  expect(await a.activeSession("copied-cookie")).toBe(false);
  await a.addSession("copied-cookie", 1100);
  await a.addSession("another-cookie", 1100);
  expect(await b.activeSession("copied-cookie")).toBe(true);
  await a.revokeSession("copied-cookie");
  expect(await b.activeSession("copied-cookie")).toBe(false);
  expect(await b.activeSession("another-cookie")).toBe(true);
  f.advance(100);
  expect(await b.activeSession("another-cookie")).toBe(false);
  expect(f.files.get("journal/users/owner/profile.json")).toBe("unchanged");
  expect(JSON.stringify([...f.files])).not.toContain("copied-cookie");
});
it("consumes flows once, including concurrent callbacks, and rejects unregistered/expired state", async () => {
  const f = fixture(),
    a = f.instance(),
    b = f.instance();
  await a.registerFlow("state", 1600, "127.0.0.1");
  const results = await Promise.allSettled([
    a.consumeFlow("state", 1600, "127.0.0.1"),
    b.consumeFlow("state", 1600, "127.0.0.1"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: expect.any(InvalidOAuthFlow),
  });
  await expect(
    a.consumeFlow("unknown", 1600, "127.0.0.1"),
  ).rejects.toBeInstanceOf(InvalidOAuthFlow);
  await a.registerFlow("expired", 1600, "127.0.0.1");
  f.advance(600);
  await expect(
    a.consumeFlow("expired", 1600, "127.0.0.1"),
  ).rejects.toBeInstanceOf(InvalidOAuthFlow);
  expect(JSON.stringify([...f.files])).not.toContain("127.0.0.1");
});
it("enforces shared client and global limits, resets expired windows and does not commit rejected attempts", async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++)
    await f.instance().registerFlow("state" + i, 1600, "client");
  const writes = vi.mocked(f.db.publish).mock.calls.length;
  await expect(
    f.instance().registerFlow("extra", 1600, "client"),
  ).rejects.toMatchObject({ retryAfter: 600 });
  expect(vi.mocked(f.db.publish).mock.calls.length).toBe(writes);
  for (let i = 0; i < 15; i++)
    await f.instance().registerFlow("other" + i, 1600, "client" + i);
  await expect(
    f.instance().registerFlow("global-extra", 1600, "new-client"),
  ).rejects.toBeInstanceOf(RateLimited);
  f.advance(600);
  await f.instance().registerFlow("new-window", 2200, "client");
});
it("does not lose concurrent session writes and preserves unrelated journal files", async () => {
  const f = fixture();
  await Promise.all([
    f.instance().addSession("one", 1100),
    f.instance().addSession("two", 1100),
  ]);
  expect(await f.instance().activeSession("one")).toBe(true);
  expect(await f.instance().activeSession("two")).toBe(true);
  expect(f.files.get("journal/users/owner/profile.json")).toBe("unchanged");
});
it("fails closed when the database cannot publish, read or contains malformed state", async () => {
  const f = fixture();
  vi.mocked(f.db.publish).mockRejectedValue(new DatabaseUnavailable());
  await expect(f.instance().addSession("one", 1100)).rejects.toBeInstanceOf(
    DatabaseUnavailable,
  );
  expect(await f.instance().activeSession("one")).toBe(false);
  vi.mocked(f.db.snapshot).mockRejectedValue(new DatabaseUnavailable());
  await expect(f.instance().activeSession("one")).rejects.toBeInstanceOf(
    DatabaseUnavailable,
  );
  const corrupt = fixture();
  corrupt.files.set("journal/security/test/state.json", '{"version":2}');
  await expect(corrupt.instance().activeSession("one")).rejects.toThrow();
});
it("enforces per-user expensive API budgets across instances", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) await f.instance().limitApi("owner", true);
  await expect(f.instance().limitApi("owner", true)).rejects.toBeInstanceOf(
    RateLimited,
  );
  await f.instance().limitApi("other", true);
  await f.instance().limitApi("owner", false);
  f.advance(60);
  await f.instance().limitApi("owner", true);
});
it("persists revocation and one-time flow consumption through real Git and retains journal data", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const { GitRemoteDatabase } = await import("../lib/git-database/git-remote");
  const dir = await mkdtemp(join(tmpdir(), "myshotlog security-")),
    exec = promisify(execFile);
  try {
    await exec("git", ["init", "--bare", dir]);
    const provider = () =>
      new GitRemoteDatabase({ remote: dir, branch: "main" });
    const db = provider();
    await db.publish(await db.snapshot("journal/users"), [
      {
        message: "Journal fixture",
        changes: [
          { path: "journal/users/owner/profile.json", content: "unchanged" },
        ],
      },
    ]);
    const instance = () =>
      new GitSecurityStore(
        provider(),
        "journal/security/test",
        "s".repeat(32),
        () => 1000,
      );
    await instance().addSession("cookie", 1100);
    expect(await instance().activeSession("cookie")).toBe(true);
    await instance().revokeSession("cookie");
    expect(await instance().activeSession("cookie")).toBe(false);
    await instance().registerFlow("state", 1600, "client");
    const outcomes = await Promise.allSettled([
      instance().consumeFlow("state", 1600, "client"),
      instance().consumeFlow("state", 1600, "client"),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.any(InvalidOAuthFlow),
    });
    expect(
      (await provider().snapshot("journal/users")).files.get(
        "journal/users/owner/profile.json",
      ),
    ).toBe("unchanged");
  } finally {
    await rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
