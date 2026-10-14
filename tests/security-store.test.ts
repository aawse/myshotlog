import { afterEach, it, expect, vi } from "vitest";
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
afterEach(() => vi.unstubAllEnvs());
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
it("does not lose concurrent rate writes and preserves unrelated journal files", async () => {
  const f = fixture();
  await Promise.all([
    f.instance().limitApi("one", true),
    f.instance().limitApi("two", true),
  ]);
  const state = JSON.parse(f.files.get("journal/security/test/state.json")!);
  expect(Object.keys(state.rates)).toHaveLength(3);
  expect(state.sessions).toBeUndefined();
  expect(f.files.get("journal/users/owner/profile.json")).toBe("unchanged");
});

it("fails closed when the database cannot publish, read or contains malformed state", async () => {
  const f = fixture();
  vi.mocked(f.db.publish).mockRejectedValue(new DatabaseUnavailable());
  await expect(
    f.instance().registerFlow("one", 1600, "client"),
  ).rejects.toBeInstanceOf(DatabaseUnavailable);
  vi.mocked(f.db.snapshot).mockRejectedValue(new DatabaseUnavailable());
  await expect(
    f.instance().consumeFlow("one", 1600, "client"),
  ).rejects.toBeInstanceOf(DatabaseUnavailable);
  const corrupt = fixture();
  corrupt.files.set("journal/security/test/state.json", '{"version":2}');
  await expect(
    corrupt.instance().consumeFlow("one", 1600, "client"),
  ).rejects.toThrow();
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
it("persists one-time flow consumption through real Git and retains journal data", async () => {
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
    await instance().registerFlow("state", 1600, "client");
    // Force identical Git timestamps and a specific interleaving: both callbacks
    // prepare their commits before the first push, then the second push starts
    // after the first finishes. Do not depend on machine speed or wall-clock luck.
    vi.stubEnv("GIT_AUTHOR_DATE", "2000-01-01T00:00:00Z");
    vi.stubEnv("GIT_COMMITTER_DATE", "2000-01-01T00:00:00Z");
    const first = provider(),
      second = provider();
    type Transport = {
      git(directory: string, args: string[], input?: string): Promise<string>;
    };
    let ready!: () => void, committed!: () => void;
    const bothPrepared = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const firstCommitted = new Promise<void>((resolve) => {
      committed = resolve;
    });
    const firstTransport = first as unknown as Transport;
    const secondTransport = second as unknown as Transport;
    const firstGit = firstTransport.git.bind(first),
      secondGit = secondTransport.git.bind(second);
    vi.spyOn(firstTransport, "git").mockImplementation(
      async (directory, args, input) => {
        if (args[0] !== "push") return firstGit(directory, args, input);
        await bothPrepared;
        try {
          return await firstGit(directory, args, input);
        } finally {
          committed();
        }
      },
    );
    vi.spyOn(secondTransport, "git").mockImplementation(
      async (directory, args, input) => {
        if (args[0] !== "push") return secondGit(directory, args, input);
        ready();
        await firstCommitted;
        return secondGit(directory, args, input);
      },
    );
    const stores = [first, second].map(
      (db) =>
        new GitSecurityStore(
          db,
          "journal/security/test",
          "s".repeat(32),
          () => 1000,
        ),
    );
    const outcomes = await Promise.allSettled(
      stores.map((store) => store.consumeFlow("state", 1600, "client")),
    );
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

it("drops legacy session state during the next security write while preserving flow protection", async () => {
  const { createHash } = await import("node:crypto");
  const f = fixture(),
    hash = createHash("sha256").update("legacy-cookie").digest("hex");
  f.files.set(
    "journal/security/test/state.json",
    JSON.stringify({
      version: 1,
      sessions: { [hash]: 1100 },
      flows: {},
      rates: {},
    }),
  );
  await f.instance().registerFlow("state", 1600, "client");
  expect(
    JSON.parse(f.files.get("journal/security/test/state.json")!).sessions,
  ).toBeUndefined();
  await f.instance().consumeFlow("state", 1600, "client");
  await expect(
    f.instance().consumeFlow("state", 1600, "client"),
  ).rejects.toBeInstanceOf(InvalidOAuthFlow);
});
