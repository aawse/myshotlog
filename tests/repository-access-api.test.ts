import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../lib/auth/server", () => ({
  authenticated: vi.fn(),
  AuthenticationRequired: class extends Error {},
}));
vi.mock("../lib/security/repository-access", () => ({
  inspectRepositoryAccess: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../lib/updates/rate-limit", async (original) => ({
  ...(await original<typeof import("../lib/updates/rate-limit")>()),
  limitUpdates: vi.fn(),
}));
import { authenticated, AuthenticationRequired } from "../lib/auth/server";
import { inspectRepositoryAccess } from "../lib/security/repository-access";
import { limitUpdates, UpdateRateLimited } from "../lib/updates/rate-limit";
import { GET } from "../app/api/repository-access/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "journal", githubId: "1" },
  } as Awaited<ReturnType<typeof authenticated>>);
  vi.mocked(inspectRepositoryAccess).mockResolvedValue({
    status: "complete",
    accounts: [],
  });
  vi.mocked(limitUpdates).mockImplementation(() => {});
});
it("requires authentication before inspecting configuration", async () => {
  vi.mocked(authenticated).mockRejectedValue(new AuthenticationRequired());
  expect((await GET()).status).toBe(401);
  expect(inspectRepositoryAccess).not.toHaveBeenCalled();
});
it("returns private uncached results after authentication", async () => {
  const response = await GET();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(inspectRepositoryAccess).toHaveBeenCalledWith();
  expect(response.status).toBe(200);
});
it("limits repeated probes before contacting GitHub", async () => {
  vi.mocked(limitUpdates).mockImplementation(() => {
    throw new UpdateRateLimited(30);
  });
  const response = await GET();
  expect(response.status).toBe(429);
  expect(inspectRepositoryAccess).not.toHaveBeenCalled();
});
it("never returns unexpected exception details", async () => {
  vi.mocked(inspectRepositoryAccess).mockRejectedValue(
    new Error("SECRET-DO-NOT-LEAK"),
  );
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("SECRET");
});
