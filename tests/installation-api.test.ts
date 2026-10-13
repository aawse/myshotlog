import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../lib/auth/server", () => ({
  authenticated: vi.fn(),
  AuthenticationRequired: class extends Error {},
}));
vi.mock("../lib/installation/check", () => ({ checkInstallation: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/updates/rate-limit", async (original) => ({
  ...(await original<typeof import("../lib/updates/rate-limit")>()),
  limitUpdates: vi.fn(),
}));
import { authenticated, AuthenticationRequired } from "../lib/auth/server";
import { checkInstallation } from "../lib/installation/check";
import { limitUpdates, UpdateRateLimited } from "../lib/updates/rate-limit";
import { GET } from "../app/api/installation/route";
const request = new Request("https://myshotlog.example/api/installation/");
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "journal", githubId: "1" },
  } as Awaited<ReturnType<typeof authenticated>>);
  vi.mocked(checkInstallation).mockResolvedValue({ checks: [] });
  vi.mocked(limitUpdates).mockImplementation(() => {});
});
it("requires authentication before inspecting configuration", async () => {
  vi.mocked(authenticated).mockRejectedValue(new AuthenticationRequired());
  expect((await GET(request)).status).toBe(401);
  expect(checkInstallation).not.toHaveBeenCalled();
});
it("returns private uncached results for the authenticated numeric ID", async () => {
  const response = await GET(request);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(checkInstallation).toHaveBeenCalledWith(
    "1",
    "https://myshotlog.example",
  );
  expect(response.status).toBe(200);
});
it("limits repeated probes before contacting GitHub", async () => {
  vi.mocked(limitUpdates).mockImplementation(() => {
    throw new UpdateRateLimited(30);
  });
  const response = await GET(request);
  expect(response.status).toBe(429);
  expect(checkInstallation).not.toHaveBeenCalled();
});
it("never returns unexpected exception details", async () => {
  vi.mocked(checkInstallation).mockRejectedValue(
    new Error("SECRET-DO-NOT-LEAK"),
  );
  const response = await GET(request);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("SECRET");
});
