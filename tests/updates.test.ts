import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  GitHubUpdates,
  updateStatus,
  clearUpdateCache,
  updateConfig,
  type UpdateConfig,
} from "../lib/updates/github";
const deployed = "a".repeat(40),
  upstream = "b".repeat(40),
  fork = "c".repeat(40);
const config: UpdateConfig = {
  repository: "tester/myshotlog",
  deployedSha: deployed,
};
function github(
  options: {
    forkHead?: string;
    ahead?: number;
    forkAhead?: number;
    parent?: string;
    error?: number;
  } = {},
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (
      url.includes("/aawse/myshotlog") &&
      new Headers(init?.headers).has("Authorization")
    )
      return Response.json(
        { message: "Resource not accessible by personal access token" },
        { status: 403 },
      );
    if (options.error)
      return Response.json(
        { message: "DO-NOT-LEAK" },
        { status: options.error },
      );
    if (url.endsWith("/tester/myshotlog"))
      return Response.json({
        full_name: "tester/myshotlog",
        fork: true,
        default_branch: "main",
        owner: { id: 1 },
        parent: {
          full_name: options.parent ?? "aawse/myshotlog",
          default_branch: "main",
        },
      });
    if (url.endsWith("/aawse/myshotlog"))
      return Response.json({
        full_name: "aawse/myshotlog",
        fork: false,
        default_branch: "main",
        owner: { id: 2 },
      });
    if (url.includes("/branches/"))
      return Response.json({
        commit: {
          sha: url.includes("/aawse/")
            ? upstream
            : (options.forkHead ?? deployed),
        },
      });
    return Response.json({
      ahead_by: url.includes(deployed)
        ? (options.ahead ?? 3)
        : (options.forkAhead ?? 0),
      commits: [
        {
          sha: upstream,
          commit: { message: "Improve precision\nFull details" },
        },
      ],
    });
  });
}
beforeEach(() => {
  clearUpdateCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("detects upstream commits missing from the deployed version", async () => {
  const status = await new GitHubUpdates(config, github()).inspect();
  expect(status).toMatchObject({
    upstreamAhead: 3,
    forkAhead: 3,
  });
  expect(status.commits[0].message).toBe("Improve precision");
});
it("reads upstream and compares pinned fork-network commits without the fork token", async () => {
  const request = github({ forkHead: fork, forkAhead: 2 });
  const status = await new GitHubUpdates(config, request).inspect();
  expect(status).toMatchObject({
    upstreamAhead: 3,
    forkAhead: 2,
  });
  const comparisons = request.mock.calls.filter(([url]) =>
    String(url).includes("/compare/"),
  );
  expect(comparisons.map(([url]) => decodeURIComponent(String(url)))).toEqual([
    `https://api.github.com/repos/aawse/myshotlog/compare/tester:${deployed}...aawse:${upstream}?per_page=100`,
    `https://api.github.com/repos/aawse/myshotlog/compare/tester:${fork}...aawse:${upstream}?per_page=100`,
  ]);
  for (const [, init] of request.mock.calls) {
    const authorization = new Headers(init?.headers).get("Authorization");
    expect(authorization).toBe(null);
  }
});
it.each([403, 429])(
  "reports exhausted public GitHub quotas (%s) as a rate limit rather than a token permission failure",
  async (httpStatus) => {
    const normal = github();
    const request: typeof fetch = async (url, init) =>
      String(url).endsWith("/aawse/myshotlog")
        ? Response.json(
            {},
            {
              status: httpStatus,
              headers: { "x-ratelimit-remaining": "0" },
            },
          )
        : normal(url, init);
    await expect(
      new GitHubUpdates(config, request).inspect(),
    ).rejects.toMatchObject({ code: "rateLimited", status: 429 });
  },
);
it("keeps an old deployment marked behind even after its fork is synchronized", async () => {
  const status = await new GitHubUpdates(
    config,
    github({ forkHead: upstream }),
  ).inspect();
  expect(status.upstreamAhead).toBe(3);
  expect(status.forkAhead).toBe(0);
});
it("does not mistake custom fork commits for missing upstream updates", async () => {
  const status = await new GitHubUpdates(
    config,
    github({ forkHead: fork, ahead: 0, forkAhead: 0 }),
  ).inspect();
  expect(status.upstreamAhead).toBe(0);
});
it("shares cached public reads and never writes to GitHub", async () => {
  const request = github();
  vi.stubGlobal("fetch", request);
  const first = await updateStatus(config);
  const calls = request.mock.calls.length;
  expect(await updateStatus(config)).toEqual(first);
  expect(request.mock.calls).toHaveLength(calls);
  expect(
    request.mock.calls.every(
      ([, init]) =>
        init?.method === "GET" &&
        !new Headers(init?.headers).has("Authorization"),
    ),
  ).toBe(true);
  expect(new GitHubUpdates(config, request)).not.toHaveProperty("sync");
});
it("maps GitHub read failures without exposing GitHub response details", async () => {
  await expect(
    new GitHubUpdates(config, github({ error: 403 })).inspect(),
  ).rejects.toMatchObject({ message: "permissions" });
});
it("infers Vercel's code repository and detects missing deployment metadata", () => {
  vi.stubEnv("GITHUB_CODE_REPOSITORY", "");
  vi.stubEnv("MYSHOTLOG_BUILD_COMMIT", "");
  vi.stubEnv("VERCEL_GIT_REPO_OWNER", "tester");
  vi.stubEnv("VERCEL_GIT_REPO_SLUG", "myshotlog");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", deployed);
  vi.stubEnv("GIT_DATABASE_REPOSITORY", "tester/private-journal");
  expect(updateConfig()?.repository).toBe("tester/myshotlog");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  expect(updateConfig()).toBeNull();
});
it("uses the embedded build commit without a manually configured deployed SHA", () => {
  vi.stubEnv("GITHUB_CODE_REPOSITORY", "tester/myshotlog");
  vi.stubEnv("MYSHOTLOG_BUILD_COMMIT", deployed);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  vi.stubEnv("GIT_DATABASE_REPOSITORY", "tester/private-journal");
  expect(updateConfig()?.deployedSha).toBe(deployed);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", fork);
  expect(updateConfig()?.deployedSha).toBe(deployed);
});
it("refuses to use the data repository for code updates", () => {
  vi.stubEnv("GITHUB_CODE_REPOSITORY", "tester/private-journal");
  vi.stubEnv("MYSHOTLOG_BUILD_COMMIT", deployed);
  vi.stubEnv("GIT_DATABASE_REPOSITORY", "tester/private-journal");
  expect(updateConfig).toThrow("configuration");
});
it("reuses repository metadata while refreshing branch heads and comparisons", async () => {
  const request = github();
  const client = new GitHubUpdates(config, request);
  await client.inspect();
  await client.inspect();
  expect(
    request.mock.calls.filter(([url]) =>
      String(url).endsWith("/tester/myshotlog"),
    ),
  ).toHaveLength(1);
  expect(
    request.mock.calls.filter(([url]) =>
      String(url).endsWith("/aawse/myshotlog"),
    ),
  ).toHaveLength(1);
  expect(
    request.mock.calls.filter(([url]) => String(url).includes("/branches/")),
  ).toHaveLength(4);
  expect(
    request.mock.calls.filter(([url]) => String(url).includes("/compare/")),
  ).toHaveLength(2);
});
it("expires cached repository metadata and does not cache upstream failures", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const request = github();
    const client = new GitHubUpdates(config, request);
    await client.inspect();
    clock.mockReturnValue(3601001);
    await client.inspect();
    expect(
      request.mock.calls.filter(([url]) =>
        String(url).endsWith("/tester/myshotlog"),
      ),
    ).toHaveLength(2);
    const normal = github();
    let fail = true;
    const failing: typeof fetch = async (url, init) =>
      fail ? Response.json({}, { status: 503 }) : normal(url, init);
    const retry = new GitHubUpdates(config, failing);
    await expect(retry.inspect()).rejects.toBeDefined();
    fail = false;
    expect((await retry.inspect()).configured).toBe(true);
  } finally {
    clock.mockRestore();
  }
});
