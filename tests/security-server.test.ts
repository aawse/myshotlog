import { it, expect, vi, beforeEach } from "vitest";
import { signSession, seal, unseal } from "../lib/auth/session";
const mock = vi.hoisted(() => ({
  token: undefined as string | undefined,
  delete: vi.fn(),
  database: vi.fn(() => {
    throw new Error("Git unavailable");
  }),
  securityStore: vi.fn(() => {
    throw new Error("Git security unavailable");
  }),
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
  database: mock.database,
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: () => ({
    secret: "s".repeat(32),
    siteUrl: "https://myshotlog.example",
    allowed: ["12345"],
    mapping: {},
  }),
}));
vi.mock("../lib/auth/security", () => ({ securityStore: mock.securityStore }));
import * as githubConfig from "../lib/auth/github";
import { currentUser, endSession } from "../lib/auth/server";
const origin = "https://myshotlog.example",
  secret = "s".repeat(32);
beforeEach(() => {
  mock.token = undefined;
  vi.clearAllMocks();
});
it("validates signed cookies and logs out without any Git security operations", async () => {
  mock.token = signSession(
    { githubId: "12345", login: "user" },
    secret,
    origin,
  );
  expect((await currentUser())?.githubId).toBe("12345");
  await endSession();
  expect(mock.delete).toHaveBeenCalledWith("skytte_session");
  expect(mock.database).not.toHaveBeenCalled();
  expect(mock.securityStore).not.toHaveBeenCalled();
  // Document the selected stateless tradeoff: a copied token survives local logout.
  expect((await currentUser())?.githubId).toBe("12345");
  mock.token = undefined;
  expect(await currentUser()).toBeNull();
});
it("rejects tampered, expired, cross-site and legacy cookies without Git", async () => {
  const token = signSession(
    { githubId: "12345", login: "user" },
    secret,
    origin,
  );
  const claims = unseal(token, secret) as Record<string, unknown>;
  for (const invalid of [
    token + "x",
    signSession(
      { githubId: "12345", login: "user" },
      secret,
      "https://other.example",
    ),
    seal({ ...claims, purpose: "github-session" }, secret),
    seal({ ...claims, exp: Math.floor(Date.now() / 1000) - 1 }, secret),
  ]) {
    mock.token = invalid;
    expect(await currentUser()).toBeNull();
  }
  expect(mock.database).not.toHaveBeenCalled();
  expect(mock.securityStore).not.toHaveBeenCalled();
});
it("can clear invalid cookies even when authentication configuration is unavailable", async () => {
  mock.token = "invalid";
  const config = vi
    .spyOn(githubConfig, "oauthConfig")
    .mockImplementation(() => {
      throw new Error("configuration unavailable");
    });
  try {
    await endSession();
    expect(mock.delete).toHaveBeenCalledWith("skytte_session");
    expect(config).not.toHaveBeenCalled();
    expect(mock.securityStore).not.toHaveBeenCalled();
  } finally {
    config.mockRestore();
  }
});
