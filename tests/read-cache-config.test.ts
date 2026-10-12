import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => {
  const instances: { snapshot: ReturnType<typeof vi.fn> }[] = [];
  class Adapter {
    snapshot = vi.fn(async () => ({
      head: null,
      files: new Map<string, string>(),
    }));
    publish = vi.fn(async () => ({ head: null, commits: [] }));
    constructor() {
      instances.push(this);
    }
  }
  return { instances, Adapter };
});
vi.mock("../lib/git-database/github", () => ({ GitHubDatabase: mock.Adapter }));
vi.mock("../lib/git-database/git-remote", () => ({
  GitRemoteDatabase: mock.Adapter,
}));
import { database } from "../lib/git-database/config";
beforeEach(() => {
  vi.stubEnv("GIT_DATABASE_PROVIDER", "github");
  vi.stubEnv("GIT_DATABASE_REPOSITORY", "fake/cache-test");
  vi.stubEnv("GIT_DATABASE_TOKEN", "fake-token");
  vi.stubEnv("GIT_DATABASE_BRANCH", "main");
  vi.stubEnv("GIT_DATABASE_READ_CACHE_SECONDS", "15");
});
afterEach(() => vi.unstubAllEnvs());
it("reuses the configured cache across requests, but isolates credential, branch, host and repository changes", async () => {
  let current = database();
  await current.readSnapshot!("users/one");
  expect(database()).toBe(current);
  await database().readSnapshot!("users/one");
  expect(mock.instances.at(-1)?.snapshot).toHaveBeenCalledTimes(1);
  for (const [key, value] of [
    ["GIT_DATABASE_TOKEN", "rotated-token"],
    ["GIT_DATABASE_BRANCH", "other"],
    ["GIT_DATABASE_REPOSITORY", "fake/other"],
    ["GIT_DATABASE_API_URL", "https://github.example/api/v3"],
    ["GIT_DATABASE_PROVIDER", "git"],
    ["GIT_DATABASE_REMOTE", "/tmp/other-cache-test.git"],
  ]) {
    vi.stubEnv(key, value);
    const changed = database();
    expect(changed).not.toBe(current);
    await changed.readSnapshot!("users/one");
    expect(mock.instances.at(-1)?.snapshot).toHaveBeenCalledTimes(1);
    current = changed;
  }
});
it("supports disabling caching and rejects invalid lifetimes", async () => {
  vi.stubEnv("GIT_DATABASE_READ_CACHE_SECONDS", "0");
  await database().readSnapshot!("users/one");
  await database().readSnapshot!("users/one");
  expect(mock.instances.at(-1)?.snapshot).toHaveBeenCalledTimes(2);
  for (const value of ["-1", "301", "1.5", "no"]) {
    vi.stubEnv("GIT_DATABASE_READ_CACHE_SECONDS", value);
    expect(() => database()).toThrow("GIT_DATABASE_READ_CACHE_SECONDS");
  }
});
