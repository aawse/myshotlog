import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const updates = vi.hoisted(() => ({ config: vi.fn(), inspect: vi.fn() }));
vi.mock("../lib/updates/github", async (original) => ({
  ...(await original<typeof import("../lib/updates/github")>()),
  updateConfig: updates.config,
  GitHubUpdates: class {
    inspect = updates.inspect;
  },
}));
import { checkInstallation } from "../lib/installation/check";
const origin = "https://myshotlog.example";
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  const env = {
    GITHUB_CLIENT_ID: "fictional-client",
    GITHUB_CLIENT_SECRET: "FICTIONAL-OAUTH-SECRET",
    AUTH_SESSION_SECRET: "FICTIONAL-COOKIE-SECRET-OF-SUFFICIENT-LENGTH",
    GITHUB_ALLOWED_USER_IDS: "1",
    GITHUB_USER_ID_MAP: "{}",
    NEXT_PUBLIC_SITE_URL: origin,
    GIT_DATABASE_PROVIDER: "github",
    GIT_DATABASE_REPOSITORY: "tester/private-journal",
    GIT_DATABASE_TOKEN: "FICTIONAL-DATA-SECRET",
    GIT_DATABASE_BRANCH: "main",
    GIT_DATABASE_PREFIX: "myshotlog/v1",
    GIT_DATABASE_API_URL: "https://api.github.com",
    GIT_DATABASE_READ_CACHE_SECONDS: "15",
    GIT_DATABASE_REMOTE: "",
    VERCEL: "",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  updates.config.mockReturnValue(null);
});
function github(
  options: {
    private?: boolean;
    archived?: boolean;
    error?: number;
    missing?: boolean;
    empty?: boolean;
  } = {},
) {
  return vi.fn(async (url: RequestInfo | URL) => {
    if (options.error)
      return Response.json(
        { message: "FICTIONAL-DATA-SECRET" },
        { status: options.error },
      );
    if (String(url).includes("/branches?"))
      return Response.json(options.empty ? [] : [{ name: "other" }]);
    if (String(url).includes("/git/ref/"))
      return options.missing
        ? Response.json({}, { status: 404 })
        : Response.json({ object: { sha: "a".repeat(40) } });
    return Response.json({
      private: options.private ?? true,
      archived: options.archived ?? false,
    });
  });
}
it("checks private branch access with reads only and does not return secret values", async () => {
  const request = github();
  const report = await checkInstallation("1", origin, request);
  expect(report.checks.find((c) => c.id === "private")?.status).toBe("ok");
  expect(report.checks.find((c) => c.id === "storage-access")?.message).toBe(
    "installation.readOk",
  );
  expect(report.checks.find((c) => c.id === "writable")?.status).toBe(
    "warning",
  );
  for (const [, init] of request.mock.calls as unknown as [
    string,
    RequestInit,
  ][]) {
    expect(init?.method ?? "GET").toBe("GET");
  }
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    "https://api.github.com/repos/tester/private-journal",
    "https://api.github.com/repos/tester/private-journal/git/ref/heads/main",
  ]);
  expect(JSON.stringify(report)).not.toMatch(
    /FICTIONAL|tester\/private-journal|fictional-client/,
  );
});
it("identifies missing values and placeholders without performing repository requests", async () => {
  vi.stubEnv("GIT_DATABASE_TOKEN", "YOUR_REPOSITORY_SCOPED_TOKEN");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  const request = github();
  const report = await checkInstallation("1", origin, request);
  expect(report.checks.find((c) => c.id === "repository")).toMatchObject({
    status: "error",
    message: "installation.missing",
    variables: ["GIT_DATABASE_TOKEN"],
  });
  expect(report.checks.find((c) => c.id === "oauth")?.variables).toEqual([
    "GITHUB_CLIENT_SECRET",
  ]);
  expect(request).not.toHaveBeenCalled();
});
it("calls out public and archived data repositories", async () => {
  const report = await checkInstallation(
    "1",
    origin,
    github({ private: false, archived: true }),
  );
  expect(report.checks.find((c) => c.id === "private")?.message).toBe(
    "installation.publicRepo",
  );
  expect(report.checks.find((c) => c.id === "writable")?.message).toBe(
    "installation.readOnly",
  );
});
it.each([true, false])(
  "distinguishes an empty repository from a wrong branch (empty=%s)",
  async (empty) => {
    const report = await checkInstallation(
      "1",
      origin,
      github({ missing: true, empty }),
    );
    expect(report.checks.find((c) => c.id === "storage-access")?.message).toBe(
      empty ? "installation.emptyRepo" : "installation.branchMissing",
    );
  },
);
it("reports failed access without revealing GitHub error bodies", async () => {
  const report = await checkInstallation("1", origin, github({ error: 403 }));
  expect(report.checks.find((c) => c.id === "storage-access")?.status).toBe(
    "error",
  );
  expect(JSON.stringify(report)).not.toContain("FICTIONAL");
});
it("flags URL mismatch, invalid cache/prefix/branch and short login secret", async () => {
  vi.stubEnv("GIT_DATABASE_READ_CACHE_SECONDS", "900");
  vi.stubEnv("AUTH_SESSION_SECRET", "short");
  const report = await checkInstallation(
    "1",
    "https://preview.example",
    github(),
  );
  expect(report.checks.find((c) => c.id === "origin")?.message).toBe(
    "installation.originMismatch",
  );
  expect(report.checks.find((c) => c.id === "storage-options")?.status).toBe(
    "error",
  );
  expect(report.checks.find((c) => c.id === "secret")?.status).toBe("error");
});
it("refuses insecure API addresses before sending credentials", async () => {
  vi.stubEnv("GIT_DATABASE_API_URL", "http://insecure.example");
  const request = github();
  const report = await checkInstallation("1", origin, request);
  expect(report.checks.find((c) => c.id === "api")?.status).toBe("error");
  expect(request).not.toHaveBeenCalled();
});
it("reports public update access without requesting a code token or write permissions", async () => {
  updates.config.mockReturnValue({});
  updates.inspect.mockResolvedValue({});
  const report = await checkInstallation("1", origin, github());
  expect(report.checks.find((c) => c.id === "updates")).toMatchObject({
    status: "ok",
    message: "installation.updateOk",
  });
  expect(
    report.checks.some((c) =>
      ["update-token", "update-permissions"].includes(c.id),
    ),
  ).toBe(false);
});
it("does not claim Git remote access was verified", async () => {
  vi.stubEnv("GIT_DATABASE_PROVIDER", "git");
  vi.stubEnv("GIT_DATABASE_REMOTE", "/fictional/data.git");
  vi.stubEnv("VERCEL", "1");
  const request = github();
  const report = await checkInstallation("1", origin, request);
  expect(report.checks.find((c) => c.id === "remote-access")?.status).toBe(
    "error",
  );
  expect(request).not.toHaveBeenCalled();
});
