import { it, expect, vi, beforeEach } from "vitest";
import { securityFixture } from "./security-fixture";
import { signSession, sessionSeconds, seal } from "../lib/auth/session";
const mock = vi.hoisted(() => ({
  token: undefined as string | undefined,
  delete: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mock.token ? { value: mock.token } : undefined),
    delete: mock.delete,
  }),
}));
vi.mock("../lib/git-database/config", () => ({
  databaseConfigured: () => true,
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: () => ({
    secret: "s".repeat(32),
    allowed: ["12345"],
    mapping: {},
  }),
}));
vi.mock("../lib/auth/security", () => ({ securityStore: () => store }));
import { currentUser, endSession } from "../lib/auth/server";
let store = securityFixture();
beforeEach(() => {
  mock.token = undefined;
  mock.delete.mockReset();
  store = securityFixture();
});
it("rejects copied cookies after logout using durable session state", async () => {
  const token = signSession(
    { githubId: "12345", login: "user" },
    "s".repeat(32),
  );
  await store.addSession(token, Math.floor(Date.now() / 1000) + sessionSeconds);
  mock.token = token;
  expect((await currentUser())?.githubId).toBe("12345");
  await endSession();
  expect(mock.delete).toHaveBeenCalledWith("skytte_session");
  mock.token = token; // An attacker replays the saved cookie after logout.
  expect(await currentUser()).toBeNull();
});
it("rejects unregistered sessions and legacy stateless tokens", async () => {
  mock.token = signSession(
    { githubId: "12345", login: "user" },
    "s".repeat(32),
  );
  expect(await currentUser()).toBeNull();
  mock.token = seal(
    {
      githubId: "12345",
      login: "user",
      purpose: "github-session",
      exp: Math.floor(Date.now() / 1000) + sessionSeconds,
    },
    "s".repeat(32),
  );
  expect(await currentUser()).toBeNull();
});
it("does not report successful logout when durable revocation fails", async () => {
  mock.token = signSession(
    { githubId: "12345", login: "user" },
    "s".repeat(32),
  );
  vi.spyOn(store, "revokeSession").mockRejectedValue(new Error("unavailable"));
  await expect(endSession()).rejects.toThrow("unavailable");
  expect(mock.delete).not.toHaveBeenCalled();
});
