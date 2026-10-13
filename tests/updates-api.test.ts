import { it, expect, vi, beforeEach } from "vitest";
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: vi.fn(),
}));
vi.mock("../lib/updates/github", async (original) => ({
  ...(await original<typeof import("../lib/updates/github")>()),
  updateStatus: vi.fn(),
}));
vi.mock("../lib/updates/rate-limit", async (original) => ({
  ...(await original<typeof import("../lib/updates/rate-limit")>()),
  limitUpdates: vi.fn(),
}));
vi.mock("server-only", () => ({}));
import { authenticated, AuthenticationRequired } from "../lib/auth/server";
import { updateStatus } from "../lib/updates/github";
import { limitUpdates, UpdateRateLimited } from "../lib/updates/rate-limit";
import * as route from "../app/api/updates/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "journal", githubId: "1" },
  } as Awaited<ReturnType<typeof authenticated>>);
  vi.mocked(updateStatus).mockResolvedValue({
    configured: true,
    upstreamAhead: 0,
    forkAhead: 0,
    commits: [],
  });
  vi.mocked(limitUpdates).mockImplementation(() => {});
});
it("requires authentication before reading update status", async () => {
  vi.mocked(authenticated).mockRejectedValue(new AuthenticationRequired());
  expect((await route.GET()).status).toBe(401);
  expect(updateStatus).not.toHaveBeenCalled();
});
it("returns private status without shared HTTP caching", async () => {
  const response = await route.GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(updateStatus).toHaveBeenCalledWith();
});
it("exports no POST handler for fork synchronization", () => {
  expect(route).not.toHaveProperty("POST");
});
it("rate limits before contacting GitHub", async () => {
  vi.mocked(limitUpdates).mockImplementation(() => {
    throw new UpdateRateLimited(30);
  });
  const response = await route.GET();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(updateStatus).not.toHaveBeenCalled();
});
it("does not expose server exception details", async () => {
  vi.mocked(updateStatus).mockRejectedValue(new Error("SECRET TOKEN"));
  const response = await route.GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("SECRET");
});
