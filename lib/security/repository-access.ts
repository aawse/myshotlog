import "server-only";
import { z } from "zod";

const accountSchema = z.object({
  id: z.number().int().positive().safe(),
  login: z
    .string()
    .max(100)
    .regex(/^[A-Za-z0-9_-]+(?:\[bot\])?$/),
  type: z.enum(["User", "Bot", "Organization"]),
});
const permissionsSchema = z.object({
  pull: z.boolean(),
  triage: z.boolean().optional(),
  push: z.boolean(),
  maintain: z.boolean().optional(),
  admin: z.boolean(),
});
const collaboratorSchema = accountSchema.extend({
  permissions: permissionsSchema,
  role_name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[^\x00-\x1f\x7f]+$/)
    .optional(),
});
const repositorySchema = z.object({
  full_name: z.string(),
  private: z.boolean(),
  visibility: z.enum(["private", "public", "internal"]).optional(),
  owner: accountSchema,
});
export type AccessRole =
  | "owner"
  | "admin"
  | "maintain"
  | "write"
  | "triage"
  | "read"
  | "unknown";
export type RepositoryAccount = {
  id: number;
  login: string;
  bot: boolean;
  role: AccessRole;
  customRole?: string;
};
export type RepositoryAccessReport = {
  status:
    | "complete"
    | "partial"
    | "unavailable"
    | "unsupported"
    | "configuration";
  issue?: "permissions" | "rateLimited" | "unavailable" | "limit";
  repository?: string;
  visibility?: "private" | "public" | "internal";
  organization?: boolean;
  accessUrl?: string;
  accounts: RepositoryAccount[];
};
class AccessFailure extends Error {
  constructor(
    public readonly issue: NonNullable<RepositoryAccessReport["issue"]>,
  ) {
    super(issue);
  }
}

/** Read metadata only: no journal reads, writes, or broader token permissions. */
export async function inspectRepositoryAccess(
  request: typeof fetch = fetch,
): Promise<RepositoryAccessReport> {
  const env = process.env;
  if (env.GIT_DATABASE_PROVIDER === "git")
    return { status: "unsupported", accounts: [] };
  let api: URL;
  const repository = env.GIT_DATABASE_REPOSITORY ?? "";
  try {
    if (
      (env.GIT_DATABASE_PROVIDER && env.GIT_DATABASE_PROVIDER !== "github") ||
      !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      repository.split("/").some((part) => part === "." || part === "..") ||
      !env.GIT_DATABASE_TOKEN
    )
      throw new Error();
    api = new URL(env.GIT_DATABASE_API_URL ?? "https://api.github.com");
    if (
      api.protocol !== "https:" ||
      api.username ||
      api.password ||
      api.search ||
      api.hash
    )
      throw new Error();
  } catch {
    return { status: "configuration", accounts: [] };
  }
  const base = api.href.replace(/\/$/, "") + "/repos/" + repository;
  const signal = AbortSignal.timeout(15000);
  const get = async (path: string): Promise<unknown> => {
    const response = await request(base + path, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + env.GIT_DATABASE_TOKEN,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      redirect: "error",
      cache: "no-store",
      signal,
    });
    if (!response.ok)
      throw new AccessFailure(
        response.status === 429 ||
          (response.status === 403 &&
            (response.headers.get("x-ratelimit-remaining") === "0" ||
              response.headers.has("retry-after")))
          ? "rateLimited"
          : [401, 403, 404].includes(response.status)
            ? "permissions"
            : "unavailable",
      );
    return response.json();
  };
  const report: RepositoryAccessReport = {
    status: "unavailable",
    accounts: [],
  };
  const accounts = new Map<number, RepositoryAccount>();
  let pagesRead = 0;
  try {
    const metadata = repositorySchema.parse(await get(""));
    if (
      metadata.full_name.toLowerCase() !== repository.toLowerCase() ||
      metadata.owner.login.toLowerCase() !==
        repository.split("/")[0].toLowerCase() ||
      (metadata.visibility &&
        metadata.private !== (metadata.visibility !== "public"))
    )
      throw new Error();
    report.repository = metadata.full_name;
    report.visibility =
      metadata.visibility ?? (metadata.private ? "private" : "public");
    report.organization = metadata.owner.type === "Organization";
    // Only known GitHub web/API relationships produce navigation links.
    const web =
      api.origin === "https://api.github.com" && api.pathname === "/"
        ? "https://github.com"
        : api.pathname.replace(/\/$/, "") === "/api/v3"
          ? api.origin
          : undefined;
    if (web) report.accessUrl = web + "/" + repository + "/settings/access";
    if (metadata.owner.type === "User")
      accounts.set(metadata.owner.id, {
        id: metadata.owner.id,
        login: metadata.owner.login,
        bot: false,
        role: "owner",
      });
    for (let page = 1; page <= 10; page++) {
      // Construct pagination locally; never follow provider Link URLs with credentials.
      const collaborators = z
        .array(collaboratorSchema)
        .max(100)
        .parse(
          await get("/collaborators?affiliation=all&per_page=100&page=" + page),
        );
      for (const account of collaborators) {
        if (account.type === "Organization") throw new Error();
        if (accounts.get(account.id)?.role === "owner") continue;
        const permissions = account.permissions;
        const role = permissions.admin
          ? "admin"
          : permissions.maintain
            ? "maintain"
            : permissions.push
              ? "write"
              : permissions.triage
                ? "triage"
                : permissions.pull
                  ? "read"
                  : "unknown";
        const customRole =
          account.role_name &&
          !["admin", "maintain", "write", "triage", "read"].includes(
            account.role_name,
          )
            ? account.role_name
            : undefined;
        accounts.set(account.id, {
          id: account.id,
          login: account.login,
          bot: account.type === "Bot",
          role,
          ...(customRole ? { customRole } : {}),
        });
      }
      pagesRead++;
      if (collaborators.length < 100) {
        report.status = "complete";
        break;
      }
      report.status = "partial";
      report.issue = "limit";
    }
    if (report.status === "complete") delete report.issue;
  } catch (error) {
    report.status = pagesRead ? "partial" : "unavailable";
    report.issue = error instanceof AccessFailure ? error.issue : "unavailable";
  }
  report.accounts = [...accounts.values()].sort((a, b) =>
    a.role === "owner"
      ? -1
      : b.role === "owner"
        ? 1
        : a.login.localeCompare(b.login, "en"),
  );
  return report;
}
