import { it, expect, vi, beforeEach } from "vitest";
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: vi.fn(),
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: () => ({ siteUrl: "https://myshotlog.example" }),
}));
const sync = vi.hoisted(() => vi.fn());
vi.mock("../lib/updates/github", async (original) => ({
  ...(await original<typeof import("../lib/updates/github")>()),
  updateStatus: vi.fn(),
  updateConfig: vi.fn(() => ({})),
  GitHubUpdates: class {
    sync = sync;
  },
  clearUpdateCache: vi.fn(),
}));
vi.mock("../lib/updates/rate-limit", async (original) => ({
  ...(await original<typeof import("../lib/updates/rate-limit")>()),
  limitUpdates: vi.fn(),
}));
vi.mock("server-only", () => ({}));
import { authenticated } from "../lib/auth/server";
import {
  updateStatus,
  clearUpdateCache,
  UpdateError,
} from "../lib/updates/github";
import { limitUpdates, UpdateRateLimited } from "../lib/updates/rate-limit";
import { GET, POST } from "../app/api/updates/route";
const upstreamSha = "b".repeat(40);
function request(
  body: unknown = { upstreamSha },
  origin = "https://myshotlog.example",
  length?: string,
) {
  return new Request("https://myshotlog.example/api/updates/", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(length ? { "content-length": length } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "owner", githubId: "1", login: "test" },
  });
  vi.mocked(limitUpdates).mockImplementation(() => {});
  vi.mocked(updateStatus).mockResolvedValue({
    configured: false,
    upstreamAhead: 0,
    forkAhead: 0,
    canSync: false,
    commits: [],
  });
  sync.mockResolvedValue({ synced: true, changed: true });
});
it("requires authentication for update reads and writes", async () => {
  vi.mocked(authenticated).mockRejectedValue(new Error("AUTH_REQUIRED"));
  expect((await GET()).status).toBe(401);
  expect((await POST(request())).status).toBe(401);
  expect(sync).not.toHaveBeenCalled();
  expect(updateStatus).not.toHaveBeenCalled();
});
it("rejects cross-origin requests before authorization or GitHub writes", async () => {
  expect((await POST(request({}, "https://other.example"))).status).toBe(403);
  expect(authenticated).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
});
it("returns private status without caching it in shared HTTP caches", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(updateStatus).toHaveBeenCalledWith("1");
});
it("accepts only the reviewed SHA and uses the authenticated GitHub identity", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(sync).toHaveBeenCalledWith("1", upstreamSha);
  expect(clearUpdateCache).toHaveBeenCalled();
});
it("rejects client-supplied repositories or oversized payloads", async () => {
  expect(
    (await POST(request({ upstreamSha, repository: "attacker/repo" }))).status,
  ).toBe(400);
  expect(
    (await POST(request({}, "https://myshotlog.example", "1025"))).status,
  ).toBe(413);
  expect(sync).not.toHaveBeenCalled();
});
it("clears stale status after a conflicting or changed upstream version", async () => {
  sync.mockRejectedValue(new UpdateError("changed", 409));
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "changed" });
  expect(clearUpdateCache).toHaveBeenCalled();
});
it("rate limits before update processing and reports Retry-After", async () => {
  vi.mocked(limitUpdates).mockImplementation(() => {
    throw new UpdateRateLimited(60);
  });
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(sync).not.toHaveBeenCalled();
});
it("does not expose server exceptions in error responses", async () => {
  sync.mockRejectedValue(new Error("SECRET TOKEN"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("SECRET");
});
