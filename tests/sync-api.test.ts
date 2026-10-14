import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth/server", () => ({
  authenticated: vi.fn(),
  AuthenticationRequired: class extends Error {},
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: vi.fn(() => ({ siteUrl: "https://journal.example" })),
}));
vi.mock("../lib/git-database/config", () => ({
  database: vi.fn(),
  databasePrefix: () => "myshotlog/v1",
}));
vi.mock("../lib/git-database/journal-prefix", () => ({
  journalPrefix: vi.fn(async () => "myshotlog/v1"),
}));
vi.mock("../lib/git-database/store", () => ({
  GitJournalStore: class {
    syncSnapshot = vi.fn(async () => ({ head: "a".repeat(40), records: {} }));
  },
  InvalidRecord: class extends Error {},
}));
vi.mock("../lib/sync/server", () => ({
  browserScope: () => "b".repeat(64),
  synchronize: vi.fn(),
  SyncConflict: class extends Error {},
}));
vi.mock("../lib/updates/rate-limit", async (original) => ({
  ...(await original<typeof import("../lib/updates/rate-limit")>()),
  limitUpdates: vi.fn(),
}));
import { authenticated, AuthenticationRequired } from "../lib/auth/server";
import { database } from "../lib/git-database/config";
import { journalPrefix } from "../lib/git-database/journal-prefix";
import { synchronize } from "../lib/sync/server";
import { limitUpdates, UpdateRateLimited } from "../lib/updates/rate-limit";
import { GET, POST } from "../app/api/sync/route";
import { targetsFor, emptyRecords } from "../lib/sync/model";
const scope = "b".repeat(64),
  head = "a".repeat(40),
  currentHead = vi.fn(async () => head);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: {
      id: "20000000-0000-4000-8000-000000000001",
      githubId: "1",
      login: "test",
    },
  });
  vi.mocked(database).mockReturnValue({
    currentHead,
    snapshot: vi.fn(),
    publish: vi.fn(),
  });
  vi.mocked(limitUpdates).mockImplementation(() => {});
});
it("requires authentication before any data or head reads", async () => {
  vi.mocked(authenticated).mockRejectedValue(new AuthenticationRequired());
  const result = await GET(
    new Request("https://journal.example/api/sync/?scope=" + scope),
  );
  expect(result.status).toBe(401);
  expect(database).not.toHaveBeenCalled();
});
it("returns unchanged for matching commit hashes without reading journal files or resolving legacy prefixes", async () => {
  const result = await GET(
    new Request(
      "https://journal.example/api/sync/?scope=" + scope + "&head=" + head,
    ),
  );
  expect(await result.json()).toEqual({ scope, head, unchanged: true });
  expect(journalPrefix).not.toHaveBeenCalled();
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects a different account/repository scope before any GitHub head lookup", async () => {
  const result = await GET(
    new Request("https://journal.example/api/sync/?scope=wrong"),
  );
  expect(result.status).toBe(403);
  expect(currentHead).not.toHaveBeenCalled();
  expect(journalPrefix).not.toHaveBeenCalled();
});
it("rejects cross-origin writes before accessing storage", async () => {
  const result = await POST(
    new Request("https://journal.example/api/sync/", {
      method: "POST",
      headers: { origin: "https://untrusted.example" },
      body: "{}",
    }),
  );
  expect(result.status).toBe(403);
  expect(database).not.toHaveBeenCalled();
});
it("validates batches and scopes before mutation and never exposes exception details", async () => {
  const result = await POST(
    new Request("https://journal.example/api/sync/", {
      method: "POST",
      headers: { origin: "https://journal.example" },
      body: JSON.stringify({ scope, head, operations: [] }),
    }),
  );
  expect(result.status).toBe(400);
  expect(synchronize).not.toHaveBeenCalled();
  vi.mocked(authenticated).mockRejectedValue(new Error("FICTIONAL-SECRET"));
  const failure = await GET(new Request("https://journal.example/api/sync/"));
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain("FICTIONAL-SECRET");
});
it("publishes only the authenticated journal with validated operations", async () => {
  const records = emptyRecords(),
    operation = {
      id: crypto.randomUUID(),
      action: "profile",
      payload: records.profile,
      photos: [],
      recording: {
        recordedAt: "2026-10-14T12:00:00Z",
        birthDate: null,
        birthYear: null,
      },
      base: targetsFor("profile", records.profile, records),
    };
  vi.mocked(synchronize).mockResolvedValue({
    head,
    records,
    acknowledged: [operation.id],
  });
  const result = await POST(
    new Request("https://journal.example/api/sync/", {
      method: "POST",
      headers: { origin: "https://journal.example" },
      body: JSON.stringify({ scope, head: null, operations: [operation] }),
    }),
  );
  expect(result.status).toBe(200);
  expect(synchronize).toHaveBeenCalledWith(
    expect.anything(),
    "20000000-0000-4000-8000-000000000001",
    "myshotlog/v1",
    [operation],
  );
});
it("limits probes without touching Git and gives a retry time", async () => {
  vi.mocked(limitUpdates).mockImplementation(() => {
    throw new UpdateRateLimited(30);
  });
  const result = await GET(new Request("https://journal.example/api/sync/"));
  expect(result.status).toBe(429);
  expect(result.headers.get("retry-after")).toBe("30");
  expect(database).not.toHaveBeenCalled();
});
