import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: vi.fn(),
}));
vi.mock("../lib/rules/latest", () => ({ latestRules: vi.fn() }));
vi.mock("../lib/updates/rate-limit", () => ({
  limitUpdates: vi.fn(),
  UpdateRateLimited: class extends Error {
    constructor(public retryAfter: number) {
      super();
    }
  },
}));
import { authenticated, AuthenticationRequired } from "../lib/auth/server";
import { latestRules } from "../lib/rules/latest";
import { limitUpdates, UpdateRateLimited } from "../lib/updates/rate-limit";
import { GET } from "../app/api/rules/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "fixture", githubId: "1" },
  } as Awaited<ReturnType<typeof authenticated>>);
  vi.mocked(limitUpdates).mockImplementation(() => {});
  vi.mocked(latestRules).mockResolvedValue({
    status: "current",
    checkedAt: "2026-10-15T00:00:00Z",
  });
});
it("authenticates before contacting the federation", async () => {
  vi.mocked(authenticated).mockRejectedValue(new AuthenticationRequired());
  expect((await GET()).status).toBe(401);
  expect(latestRules).not.toHaveBeenCalled();
});
it("returns private rule status without accepting external URLs or using journal data", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(latestRules).toHaveBeenCalledWith();
  expect(limitUpdates).toHaveBeenCalledWith("fixture:rules");
});
it("limits checks before external requests", async () => {
  vi.mocked(limitUpdates).mockImplementation(() => {
    throw new UpdateRateLimited(30);
  });
  const response = await GET();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(latestRules).not.toHaveBeenCalled();
});
it("does not expose unexpected exception details", async () => {
  vi.mocked(latestRules).mockRejectedValue(new Error("PRIVATE fixture"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("PRIVATE");
});
