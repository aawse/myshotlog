import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DatabaseConflict,
  DatabaseUnavailable,
  validBranch,
  validPath,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "./types";
export type GitRemoteOptions = { remote: string; branch: string };
// Local bare repositories, SSH and HTTPS remotes all use the same Git object protocol.
export class GitRemoteDatabase implements GitDatabase {
  private branch: string;
  constructor(private options: GitRemoteOptions) {
    if (
      !options.remote ||
      options.remote.startsWith("-") ||
      /[\x00-\x1f]/.test(options.remote)
    )
      throw new DatabaseUnavailable();
    this.branch = validBranch(options.branch);
  }
  private async git(
    directory: string,
    args: string[],
    input?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Fetch/push must not spawn background maintenance that outlives the request
      // and recreates files while the temporary photo-containing repository is removed.
      const child = spawn(
        "git",
        [
          "-c",
          "gc.auto=0",
          "-c",
          "maintenance.auto=false",
          "-C",
          directory,
          ...args,
        ],
        {
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_AUTHOR_NAME: "MyShotLog",
            GIT_AUTHOR_EMAIL: "journal@myshotlog.invalid",
            GIT_COMMITTER_NAME: "MyShotLog",
            GIT_COMMITTER_EMAIL: "journal@myshotlog.invalid",
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let output = "",
        size = 0;
      const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > 32_000_000) child.kill("SIGKILL");
        else output += chunk.toString();
      });
      child.stderr.resume(); // Upstream errors can contain credentials; do not retain or log them.
      child.once("error", () => {
        clearTimeout(timer);
        reject(new DatabaseUnavailable());
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(output);
        else reject(new DatabaseUnavailable());
      });
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
  }
  private async temporary<T>(run: (directory: string) => Promise<T>) {
    const directory = await mkdtemp(join(tmpdir(), "skytte-git-"));
    try {
      await this.git(directory, ["init", "--bare"]);
      return await run(directory);
    } finally {
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  }
  private async fetch(directory: string) {
    const refs = await this.git(directory, [
      "ls-remote",
      "--heads",
      this.options.remote,
      "refs/heads/" + this.branch,
    ]);
    if (!refs.trim()) return null;
    await this.git(directory, [
      "fetch",
      "--no-tags",
      this.options.remote,
      "refs/heads/" + this.branch,
    ]);
    return (await this.git(directory, ["rev-parse", "FETCH_HEAD"])).trim();
  }
  async snapshot(prefix: string): Promise<GitSnapshot> {
    validPath(prefix);
    return this.temporary(async (directory) => {
      const head = await this.fetch(directory),
        files = new Map<string, string>();
      if (!head) return { head, files };
      const paths = (
        await this.git(directory, [
          "ls-tree",
          "-r",
          "--name-only",
          "-z",
          head,
          "--",
          prefix + "/",
        ])
      )
        .split("\0")
        .filter(Boolean);
      for (const path of paths) {
        validPath(path);
        files.set(path, await this.git(directory, ["show", head + ":" + path]));
      }
      return { head, files };
    });
  }
  async publish(snapshot: GitSnapshot, entries: EntryCommit[]) {
    if (!entries.length) return { head: snapshot.head, commits: [] };
    return this.temporary(async (directory) => {
      const current = await this.fetch(directory);
      if (current !== snapshot.head) throw new DatabaseConflict();
      if (current) await this.git(directory, ["read-tree", current]);
      else await this.git(directory, ["read-tree", "--empty"]);
      let parent = current;
      const commits: string[] = [];
      for (const entry of entries) {
        for (const change of entry.changes) {
          validPath(change.path);
          if (change.content === null)
            await this.git(
              directory,
              ["update-index", "--index-info"],
              "0 " + "0".repeat(40) + "\t" + change.path + "\n",
            );
          else {
            const blob = (
              await this.git(
                directory,
                ["hash-object", "-w", "--stdin"],
                change.content,
              )
            ).trim();
            await this.git(directory, [
              "update-index",
              "--add",
              "--cacheinfo",
              "100644",
              blob,
              change.path,
            ]);
          }
        }
        const tree = (await this.git(directory, ["write-tree"])).trim();
        parent = (
          await this.git(
            directory,
            ["commit-tree", tree, ...(parent ? ["-p", parent] : [])],
            entry.message + "\n",
          )
        ).trim();
        commits.push(parent);
      }
      try {
        await this.git(directory, [
          "push",
          "--porcelain",
          "--force-with-lease=refs/heads/" +
            this.branch +
            ":" +
            (snapshot.head ?? ""),
          this.options.remote,
          parent + ":refs/heads/" + this.branch,
        ]);
      } catch {
        const latest = await this.fetch(directory);
        if (latest !== snapshot.head) throw new DatabaseConflict();
        throw new DatabaseUnavailable(
          "Git-push misslyckades. Kontrollera åtkomst och branchregler.",
        );
      }
      return { head: parent, commits };
    });
  }
}
