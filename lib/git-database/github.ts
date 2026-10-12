import { swText } from "@/lib/i18n";
import { z } from "../validation";
import {
  DatabaseConflict,
  DatabaseUnavailable,
  validBranch,
  validPath,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "./types";
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const refSchema = z.object({ object: z.object({ sha }) });
const commitSchema = z.object({ sha, tree: z.object({ sha }) });
const treeSchema = z.object({
  sha,
  truncated: z.boolean().optional(),
  tree: z.array(z.object({ path: z.string(), type: z.string(), sha })),
});
const blobSchema = z.object({
  content: z.string(),
  encoding: z.literal("base64"),
});
type Options = {
  repository: string;
  branch: string;
  token: string;
  apiUrl?: string;
  fetch?: typeof fetch;
};
export class GitHubDatabase implements GitDatabase {
  private readonly base: string;
  private readonly request: typeof fetch;
  private readonly branch: string;
  constructor(private options: Options) {
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repository) ||
      !options.token
    )
      throw new DatabaseUnavailable();
    this.branch = validBranch(options.branch);
    this.base =
      (options.apiUrl ?? "https://api.github.com").replace(/\/$/, "") +
      "/repos/" +
      options.repository;
    this.request = options.fetch ?? fetch;
    if (!this.base.startsWith("https://"))
      throw new DatabaseUnavailable(swText("store.https"));
  }
  private async api(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(this.base + path, {
        method,
        headers: {
          Authorization: "Bearer " + this.options.token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new DatabaseUnavailable();
    }
    if (!response.ok) {
      // Never expose upstream bodies, repository URLs or tokens in browser errors.
      if (
        (response.status === 409 || response.status === 422) &&
        path.startsWith("/git/refs/")
      )
        throw new DatabaseConflict();
      if (
        response.status === 409 &&
        method === "GET" &&
        path.startsWith("/git/ref/heads/")
      )
        throw new EmptyRepository();
      if (
        (response.status === 409 || response.status === 422) &&
        method === "PUT" &&
        path === "/contents/.myshotlog.json"
      )
        throw new DatabaseConflict();
      if (response.status === 404) throw new MissingReference();
      throw new DatabaseUnavailable(
        response.status === 403 || response.status === 429
          ? swText("store.access")
          : undefined,
      );
    }
    return response.json();
  }
  private async checkPrivate() {
    const data = z.object({ private: z.boolean() }).parse(await this.api(""));
    if (!data.private) throw new DatabaseUnavailable(swText("store.private"));
  }
  private async head(): Promise<string | null> {
    try {
      return refSchema.parse(
        await this.api(
          "/git/ref/heads/" +
            this.branch.split("/").map(encodeURIComponent).join("/"),
        ),
      ).object.sha;
    } catch (error) {
      if (
        !(error instanceof MissingReference || error instanceof EmptyRepository)
      )
        throw error;
      // A missing configured branch in an existing repo is not an empty journal.
      const branches = z
        .array(z.object({ name: z.string() }))
        .parse(await this.api("/branches?per_page=1"));
      if (branches.length)
        throw new DatabaseUnavailable(swText("store.branch"));
      return null;
    }
  }
  async snapshot(prefix: string): Promise<GitSnapshot> {
    validPath(prefix);
    await this.checkPrivate();
    const head = await this.head();
    if (!head) return { head: null, files: new Map() };
    const commit = commitSchema.parse(await this.api("/git/commits/" + head));
    const tree = treeSchema.parse(
      await this.api("/git/trees/" + commit.tree.sha + "?recursive=1"),
    );
    if (tree.truncated)
      throw new DatabaseUnavailable(swText("store.largeTree"));
    const entries = tree.tree.filter(
      (e) => e.type === "blob" && e.path.startsWith(prefix + "/"),
    );
    const files = new Map<string, string>();
    // Bounded parallelism keeps requests within predictable limits.
    for (let i = 0; i < entries.length; i += 6)
      await Promise.all(
        entries.slice(i, i + 6).map(async (entry) => {
          const blob = blobSchema.parse(
            await this.api("/git/blobs/" + entry.sha),
          );
          files.set(
            entry.path,
            Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString(
              "utf8",
            ),
          );
        }),
      );
    return { head, files };
  }
  async publish(snapshot: GitSnapshot, entries: EntryCommit[]) {
    if (!entries.length) return { head: snapshot.head, commits: [] };
    let parent = snapshot.head;
    if (!parent) {
      await this.checkPrivate();
      if (await this.head()) throw new DatabaseConflict();
      // Git object APIs require a first commit. Bootstrap only metadata, then
      // publish the requested post chain atomically as on an initialized repo.
      parent = z.object({ commit: z.object({ sha }) }).parse(
        await this.api("/contents/.myshotlog.json", "PUT", {
          message: "MyShotLog: initialize data repository",
          content: Buffer.from(
            JSON.stringify({ app: "myshotlog", version: 1 }) + "\n",
          ).toString("base64"),
          branch: this.branch,
        }),
      ).commit.sha;
    }
    const commits: string[] = [];
    let baseTree = commitSchema.parse(await this.api("/git/commits/" + parent))
      .tree.sha;
    for (const entry of entries) {
      const items = [];
      for (const change of entry.changes) {
        validPath(change.path);
        items.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          ...(change.content === null
            ? { sha: null }
            : { content: change.content }),
        });
      }
      baseTree = z.object({ sha }).parse(
        await this.api("/git/trees", "POST", {
          base_tree: baseTree,
          tree: items,
        }),
      ).sha;
      parent = z.object({ sha }).parse(
        await this.api("/git/commits", "POST", {
          message: entry.message,
          tree: baseTree,
          parents: [parent],
          author: { name: "MyShotLog", email: "journal@myshotlog.invalid" },
        }),
      ).sha;
      commits.push(parent);
    }
    // All commits remain unreachable from the database branch until this single update.
    // No force push: concurrent forward changes are rejected and retried from a new snapshot.
    try {
      await this.api(
        "/git/refs/heads/" +
          this.branch.split("/").map(encodeURIComponent).join("/"),
        "PATCH",
        { sha: parent, force: false },
      );
    } catch (e) {
      if (e instanceof MissingReference) throw new DatabaseConflict();
      throw e;
    }
    return { head: parent, commits };
  }
}
class MissingReference extends Error {}

class EmptyRepository extends Error {}
