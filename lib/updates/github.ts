import "server-only";
import { createHash } from "node:crypto";
import { z } from "@/lib/validation";
import type { UpdateStatus, UpdateErrorCode } from "./model";
export const upstreamRepository = "aawse/myshotlog";
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const repository = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/);
const branchName = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !/[\s~^:?*\[\\]/.test(value) &&
      !value.includes("..") &&
      !value.startsWith("-") &&
      !value.endsWith("/") &&
      !value.endsWith(".lock"),
  );
export class UpdateError extends Error {
  constructor(
    public readonly code: UpdateErrorCode,
    public readonly status = 503,
  ) {
    super(code);
  }
}
export type UpdateConfig = {
  repository: string;
  branch?: string;
  deployedSha: string;
};
export function updateConfig(): UpdateConfig | null {
  const inferred =
    process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? process.env.VERCEL_GIT_REPO_OWNER +
        "/" +
        process.env.VERCEL_GIT_REPO_SLUG
      : undefined;
  const repo = process.env.GITHUB_CODE_REPOSITORY || inferred;
  const deployed =
    process.env.MYSHOTLOG_BUILD_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA;
  if (!repo || !deployed) return null;
  if (
    !repository.safeParse(repo).success ||
    !sha.safeParse(deployed).success ||
    repo.toLowerCase() ===
      (process.env.GIT_DATABASE_REPOSITORY ?? "").toLowerCase()
  )
    throw new UpdateError("configuration");
  const branch = process.env.GITHUB_CODE_BRANCH || undefined;
  if (branch && !branchName.safeParse(branch).success)
    throw new UpdateError("configuration");
  return {
    repository: repo,
    branch,
    deployedSha: deployed,
  };
}
const metadataSchema = z.object({
  full_name: repository,
  default_branch: branchName,
  fork: z.boolean(),
  parent: z
    .object({ full_name: repository, default_branch: branchName })
    .optional(),
});
const compareSchema = z.object({
  ahead_by: z.number().int().nonnegative(),
  commits: z.array(
    z.object({ sha, commit: z.object({ message: z.string() }) }),
  ),
});
export class GitHubUpdates {
  constructor(
    readonly config: UpdateConfig,
    readonly request: typeof fetch = fetch,
  ) {}
  private async api(route: string) {
    let response: Response;
    try {
      response = await this.request("https://api.github.com/repos/" + route, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new UpdateError("unavailable");
    }
    if (!response.ok) {
      if (
        response.status === 429 ||
        (response.status === 403 &&
          response.headers.get("x-ratelimit-remaining") === "0")
      )
        throw new UpdateError("rateLimited", 429);
      if ([401, 403].includes(response.status))
        throw new UpdateError("permissions", 403);
      throw new UpdateError("unavailable");
    }
    if (response.status === 204) return {};
    try {
      return await response.json();
    } catch {
      throw new UpdateError("unavailable");
    }
  }
  async inspect(): Promise<UpdateStatus> {
    try {
      const [forkMetadata, upstreamMetadata] = await Promise.all([
        this.api(this.config.repository),
        this.api(upstreamRepository),
      ]);
      const meta = metadataSchema.parse(forkMetadata);
      if (meta.full_name.toLowerCase() !== this.config.repository.toLowerCase())
        throw new UpdateError("configuration");
      const upstream = metadataSchema.parse(upstreamMetadata);
      const branch = this.config.branch ?? meta.default_branch;
      const [forkHead, upstreamHead] = await Promise.all([
        this.api(
          this.config.repository + "/branches/" + encodeURIComponent(branch),
        ),
        this.api(
          upstreamRepository +
            "/branches/" +
            encodeURIComponent(upstream.default_branch),
        ),
      ]);
      const head = z.object({ commit: z.object({ sha }) }).parse(forkHead)
        .commit.sha;
      const upstreamSha = z
        .object({ commit: z.object({ sha }) })
        .parse(upstreamHead).commit.sha;
      // Public fork-network reads use no credentials. Qualify both pinned SHAs
      // with their repository owners.
      const forkOwner = meta.full_name.split("/")[0];
      const upstreamOwner = upstreamRepository.split("/")[0];
      const compare = async (base: string) =>
        base === upstreamSha
          ? { ahead_by: 0, commits: [] }
          : compareSchema.parse(
              await this.api(
                upstreamRepository +
                  "/compare/" +
                  encodeURIComponent(
                    forkOwner +
                      ":" +
                      base +
                      "..." +
                      upstreamOwner +
                      ":" +
                      upstreamSha,
                  ) +
                  "?per_page=100",
              ),
            );
      const [running, fork] = await Promise.all([
        compare(this.config.deployedSha),
        head === this.config.deployedSha
          ? Promise.resolve(undefined)
          : compare(head),
      ]);
      const validFork =
        meta.fork &&
        meta.parent?.full_name.toLowerCase() === upstreamRepository;
      const block = validFork ? undefined : "fork";
      return {
        configured: true,
        repository: meta.full_name,
        branch,
        deployedSha: this.config.deployedSha,
        upstreamSha,
        forkSha: head,
        upstreamAhead: running.ahead_by,
        forkAhead: (fork ?? running).ahead_by,
        block,
        checkedAt: new Date().toISOString(),
        commits: running.commits
          .slice(-5)
          .reverse()
          .map((c) => ({
            sha: c.sha,
            message: c.commit.message.split("\n")[0].slice(0, 240),
          })),
      };
    } catch (error) {
      if (error instanceof UpdateError) throw error;
      throw new UpdateError("unavailable");
    }
  }
}
// Cache public code metadata per configuration.
let snapshot:
  | {
      key: string;
      until: number;
      promise: Promise<UpdateStatus>;
    }
  | undefined;
export async function updateStatus(
  config = updateConfig(),
): Promise<UpdateStatus> {
  if (!config)
    return {
      configured: false,
      upstreamAhead: 0,
      forkAhead: 0,
      block: "configuration",
      commits: [],
    };
  const key = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  if (!snapshot || snapshot.key !== key || snapshot.until < Date.now()) {
    const promise = new GitHubUpdates(config).inspect();
    snapshot = { key, until: Date.now() + 300000, promise };
    promise.catch(() => {
      if (snapshot?.promise === promise) snapshot = undefined;
    });
  }
  return snapshot.promise;
}
export function clearUpdateCache() {
  snapshot = undefined;
}
