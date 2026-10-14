import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { inspectRepositoryAccess } from "../lib/security/repository-access";
const owner = { id: 1, login: "tester", type: "User" };
const metadata = {
  full_name: "tester/private-journal",
  private: true,
  visibility: "private",
  owner,
};
function collaborator(id: number, role = "read") {
  return {
    id,
    login: `account-${id}`,
    type: "User",
    permissions: {
      pull: true,
      push: role === "write",
      admin: role === "admin",
      maintain: role === "maintain",
      triage: role === "triage",
    },
    role_name: role,
    email: "PRIVATE-EMAIL",
    avatar_url: "https://untrusted.example/photo",
  };
}
beforeEach(() => {
  vi.stubEnv("GIT_DATABASE_PROVIDER", "github");
  vi.stubEnv("GIT_DATABASE_REPOSITORY", metadata.full_name);
  vi.stubEnv("GIT_DATABASE_TOKEN", "FICTIONAL-TOKEN");
  vi.stubEnv("GIT_DATABASE_API_URL", "https://api.github.com");
});
afterEach(() => vi.unstubAllEnvs());
function mockGithub(pages: unknown[] = [[]], repo: unknown = metadata) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const page = new URL(String(url)).searchParams.get("page");
    return Response.json(page ? pages[Number(page) - 1] : repo);
  });
}
it("includes the personal owner even when omitted by GitHub, returns minimal fields and performs uncached reads only", async () => {
  const request = mockGithub([
    [
      collaborator(2, "write"),
      { ...collaborator(1, "admin"), login: "tester" },
    ],
  ]);
  const report = await inspectRepositoryAccess(request);
  expect(report.status).toBe("complete");
  expect(report.accounts).toEqual([
    { id: 1, login: "tester", bot: false, role: "owner" },
    { id: 2, login: "account-2", bot: false, role: "write" },
  ]);
  expect(report.accessUrl).toBe(
    "https://github.com/tester/private-journal/settings/access",
  );
  expect(JSON.stringify(report)).not.toMatch(
    /FICTIONAL-TOKEN|PRIVATE-EMAIL|avatar_url/,
  );
  for (const [, options] of request.mock.calls as unknown as [
    string,
    RequestInit,
  ][]) {
    expect(options).toMatchObject({
      method: "GET",
      cache: "no-store",
      redirect: "error",
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers).toMatchObject({
      Authorization: "Bearer FICTIONAL-TOKEN",
    });
  }
});
it("paginates a full page and deduplicates accounts without trusting foreign Link headers", async () => {
  const first = Array.from({ length: 100 }, (_, i) => collaborator(i + 2));
  const request = vi.fn(async (url: RequestInfo | URL) => {
    const page = new URL(String(url)).searchParams.get("page");
    return Response.json(
      page === "1"
        ? first
        : page === "2"
          ? [collaborator(2), collaborator(102)]
          : metadata,
      { headers: { Link: '<https://untrusted.example/steal>; rel="next"' } },
    );
  });
  const report = await inspectRepositoryAccess(request);
  expect(report.status).toBe("complete");
  expect(report.accounts).toHaveLength(102);
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    "https://api.github.com/repos/tester/private-journal",
    "https://api.github.com/repos/tester/private-journal/collaborators?affiliation=all&per_page=100&page=1",
    "https://api.github.com/repos/tester/private-journal/collaborators?affiliation=all&per_page=100&page=2",
  ]);
});
it("bounds large lists and explicitly marks them partial", async () => {
  const pages = Array.from({ length: 10 }, (_, page) =>
    Array.from({ length: 100 }, (_, i) => collaborator(page * 100 + i + 2)),
  );
  const request = mockGithub(pages);
  const report = await inspectRepositoryAccess(request);
  expect(report).toMatchObject({ status: "partial", issue: "limit" });
  expect(report.accounts).toHaveLength(1001);
  expect(request).toHaveBeenCalledTimes(11);
});
it.each([401, 403, 404, 429, 500])(
  "does not mistake GitHub %s for an empty safe list",
  async (status) => {
    const request = vi.fn(async () =>
      Response.json({ message: "FICTIONAL-TOKEN" }, { status }),
    );
    const report = await inspectRepositoryAccess(request);
    expect(report.status).toBe("unavailable");
    expect(report.issue).toBe(
      status === 429
        ? "rateLimited"
        : status === 500
          ? "unavailable"
          : "permissions",
    );
    expect(report.accounts).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("FICTIONAL-TOKEN");
  },
);
it("preserves confirmed accounts and privacy when a later page is forbidden", async () => {
  const request = vi.fn(async (url: RequestInfo | URL) => {
    const page = new URL(String(url)).searchParams.get("page");
    return page === "2"
      ? Response.json({}, { status: 403 })
      : Response.json(
          page
            ? Array.from({ length: 100 }, (_, i) => collaborator(i + 2))
            : metadata,
        );
  });
  expect(await inspectRepositoryAccess(request)).toMatchObject({
    status: "partial",
    issue: "permissions",
    visibility: "private",
    accounts: expect.any(Array),
  });
});
it("preserves owner and visibility if collaborators are unavailable, including GitHub rate limits", async () => {
  const request = vi.fn(async (url: RequestInfo | URL) =>
    String(url).includes("collaborators")
      ? Response.json(
          {},
          { status: 403, headers: { "X-RateLimit-Remaining": "0" } },
        )
      : Response.json(metadata),
  );
  expect(await inspectRepositoryAccess(request)).toMatchObject({
    status: "unavailable",
    issue: "rateLimited",
    visibility: "private",
    accounts: [{ id: owner.id, login: owner.login, bot: false, role: "owner" }],
  });
});
it.each(["public", "internal"])(
  "retains %s visibility independently from listed accounts",
  async (visibility) => {
    const report = await inspectRepositoryAccess(
      mockGithub([[]], {
        ...metadata,
        private: visibility !== "public",
        visibility,
      }),
    );
    expect(report).toMatchObject({ status: "complete", visibility });
  },
);
it("uses effective permissions, preserves custom roles and identifies bots without inventing organization owners", async () => {
  const report = await inspectRepositoryAccess(
    mockGithub(
      [
        [
          collaborator(2, "admin"),
          collaborator(3, "maintain"),
          collaborator(4, "triage"),
          {
            ...collaborator(5, "Custom reviewer"),
            login: "automation[bot]",
            type: "Bot",
          },
        ],
      ],
      { ...metadata, owner: { ...owner, type: "Organization" } },
    ),
  );
  expect(report.organization).toBe(true);
  expect(report.accounts.map((a) => a.role)).toEqual([
    "admin",
    "maintain",
    "triage",
    "read",
  ]);
  expect(report.accounts[3]).toMatchObject({
    bot: true,
    customRole: "Custom reviewer",
  });
  expect(report.accounts.some((a) => a.role === "owner")).toBe(false);
});
it.each([
  { ...metadata, full_name: "other/repo" },
  { ...metadata, private: false },
  { ...metadata, owner: { ...owner, login: "<script>" } },
])("rejects malformed or mismatched repository metadata", async (repo) => {
  expect(await inspectRepositoryAccess(mockGithub([[]], repo))).toMatchObject({
    status: "unavailable",
    accounts: [],
  });
});
it("never reports malformed collaborators as a complete list", async () => {
  expect(
    await inspectRepositoryAccess(
      mockGithub([[{ ...collaborator(2), permissions: {} }]]),
    ),
  ).toMatchObject({ status: "unavailable", issue: "unavailable" });
});
it("handles network and JSON failures without returning provider details", async () => {
  const request = vi.fn(async () => {
    throw new Error("FICTIONAL-TOKEN");
  });
  expect(await inspectRepositoryAccess(request)).toEqual({
    status: "unavailable",
    issue: "unavailable",
    accounts: [],
  });
});
it.each(["git", "invalid"])(
  "does not make provider calls for %s adapters",
  async (provider) => {
    vi.stubEnv("GIT_DATABASE_PROVIDER", provider);
    const request = mockGithub();
    expect((await inspectRepositoryAccess(request)).status).toBe(
      provider === "git" ? "unsupported" : "configuration",
    );
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([
  "http://api.github.com",
  "https://user:password@api.github.com",
  "https://api.github.com?secret=value",
])(
  "rejects unsafe API configuration %s before sending credentials",
  async (api) => {
    vi.stubEnv("GIT_DATABASE_API_URL", api);
    const request = mockGithub();
    expect((await inspectRepositoryAccess(request)).status).toBe(
      "configuration",
    );
    expect(request).not.toHaveBeenCalled();
  },
);
it("constructs enterprise navigation from the configured API rather than arbitrary provider html_url", async () => {
  vi.stubEnv("GIT_DATABASE_API_URL", "https://github.example/api/v3/");
  const request = mockGithub([[]], {
    ...metadata,
    html_url: "javascript:alert(1)",
  });
  expect((await inspectRepositoryAccess(request)).accessUrl).toBe(
    "https://github.example/tester/private-journal/settings/access",
  );
  expect(String(request.mock.calls[0][0])).toBe(
    "https://github.example/api/v3/repos/tester/private-journal",
  );
});
