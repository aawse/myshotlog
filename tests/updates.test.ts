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
  token: "FICTIONAL-CODE-TOKEN",
  preview: false,
};
function github(
  options: {
    forkHead?: string;
    ahead?: number;
    forkAhead?: number;
    parent?: string;
    mergeStatus?: number;
    error?: number;
  } = {},
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (options.error)
      return Response.json(
        { message: "DO-NOT-LEAK" },
        { status: options.error },
      );
    if (init?.method === "POST")
      return options.mergeStatus === 204
        ? new Response(null, { status: 204 })
        : Response.json({ sha: fork }, { status: options.mergeStatus ?? 201 });
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
  const status = await new GitHubUpdates(config, github()).inspect("1");
  expect(status).toMatchObject({
    upstreamAhead: 3,
    forkAhead: 3,
    canSync: true,
  });
  expect(status.commits[0].message).toBe("Improve precision");
});
it("keeps an old deployment marked behind even after its fork is synchronized", async () => {
  const status = await new GitHubUpdates(
    config,
    github({ forkHead: upstream }),
  ).inspect("1");
  expect(status.upstreamAhead).toBe(3);
  expect(status.forkAhead).toBe(0);
});
it("does not mistake custom fork commits for missing upstream updates", async () => {
  const status = await new GitHubUpdates(
    config,
    github({ forkHead: fork, ahead: 0, forkAhead: 0 }),
  ).inspect("1");
  expect(status.upstreamAhead).toBe(0);
});
it("merges the reviewed commit into the configured code branch without force updates", async () => {
  const request = github({ forkHead: fork, forkAhead: 2 });
  await new GitHubUpdates(config, request).sync("1", upstream);
  const writes = request.mock.calls.filter(
    ([, init]) => init?.method === "POST",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe(
    "https://api.github.com/repos/tester/myshotlog/merges",
  );
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
    base: "main",
    head: upstream,
  });
  expect(writes[0][1]?.redirect).toBe("error");
});
it.each([
  [{ ...config }, "99", "owner"],
  [{ ...config, preview: true }, "1", "preview"],
  [{ ...config, deployedBranch: "preview-branch" }, "1", "preview"],
  [{ ...config, token: undefined }, "1", "token"],
  [{ ...config, admins: ["99"] }, "1", "owner"],
])(
  "blocks writes without ownership, production scope or credentials",
  async (cfg, id, block) => {
    const request = github();
    const client = new GitHubUpdates(cfg, request);
    expect((await client.inspect(id)).block).toBe(block);
    await expect(client.sync(id, upstream)).rejects.toBeDefined();
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  },
);
it("allows only explicitly listed admins when an override is configured", async () => {
  expect(
    (
      await new GitHubUpdates({ ...config, admins: ["99"] }, github()).inspect(
        "99",
      )
    ).canSync,
  ).toBe(true);
});
it("refuses to write to a fork with a different upstream", async () => {
  const request = github({ parent: "other/project" });
  await expect(
    new GitHubUpdates(config, request).sync("1", upstream),
  ).rejects.toMatchObject({ code: "configuration" });
  expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
    false,
  );
});
it("rejects a stale reviewed version before writing", async () => {
  const request = github();
  await expect(
    new GitHubUpdates(config, request).sync("1", fork),
  ).rejects.toMatchObject({ code: "changed", status: 409 });
  expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
    false,
  );
});
it.each([409, 422])(
  "reports merge conflicts instead of resetting the fork",
  async (mergeStatus) => {
    const request = github({ mergeStatus });
    await expect(
      new GitHubUpdates(config, request).sync("1", upstream),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    expect(
      request.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  },
);
it("treats already-applied merges as successful and idempotent", async () => {
  await expect(
    new GitHubUpdates(config, github({ mergeStatus: 204 })).sync("1", upstream),
  ).resolves.toMatchObject({ synced: true });
  const request = github({ forkHead: upstream });
  await new GitHubUpdates(config, request).sync("1", upstream);
  expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
    false,
  );
});
it("shares cached reads but derives authorization separately for each account", async () => {
  const request = github();
  vi.stubGlobal("fetch", request);
  const owner = await updateStatus("1", config);
  const calls = request.mock.calls.length;
  const guest = await updateStatus("99", config);
  expect(owner.canSync).toBe(true);
  expect(guest.canSync).toBe(false);
  expect(guest.block).toBe("owner");
  expect(request.mock.calls).toHaveLength(calls);
  expect(owner).not.toHaveProperty("ownerId");
  expect(JSON.stringify(owner)).not.toContain(config.token);
});
it("maps token failures without exposing GitHub response details", async () => {
  await expect(
    new GitHubUpdates(config, github({ error: 403 })).inspect("1"),
  ).rejects.toMatchObject({ message: "permissions" });
});
it("infers Vercel's code repository and detects missing deployment metadata", () => {
  vi.stubEnv("GITHUB_CODE_REPOSITORY", "");
  vi.stubEnv("MYSHOTLOG_DEPLOYED_COMMIT", "");
  vi.stubEnv("VERCEL_GIT_REPO_OWNER", "tester");
  vi.stubEnv("VERCEL_GIT_REPO_SLUG", "myshotlog");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", deployed);
  vi.stubEnv("GIT_DATABASE_REPOSITORY", "tester/private-journal");
  expect(updateConfig()?.repository).toBe("tester/myshotlog");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  expect(updateConfig()).toBeNull();
});
it("refuses to use the data repository for code updates", () => {
  vi.stubEnv("GITHUB_CODE_REPOSITORY", "tester/private-journal");
  vi.stubEnv("MYSHOTLOG_DEPLOYED_COMMIT", deployed);
  vi.stubEnv("GIT_DATABASE_REPOSITORY", "tester/private-journal");
  expect(updateConfig).toThrow("configuration");
});
