import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { validBranch } from "../lib/git-database/types";

const exec = promisify(execFile);

export function isGitRemote(value: string) {
  if (/[\s\x00-\x1f\x7f]/.test(value)) return false;
  if (
    /^(?:[\w.-]+@)?[a-zA-Z0-9][\w.-]*:[^:]+$/.test(value) &&
    !value.includes("://")
  )
    return true;
  try {
    const url = new URL(value);
    return (
      ["ssh:", "https:", "file:"].includes(url.protocol) &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "ssh:" || !url.username)
    );
  } catch {
    return false;
  }
}

export class RemoteTruncateUnverified extends Error {}

export async function truncateRemoteJournal(
  remote: string,
  confirmation: string,
) {
  if (confirmation !== remote || !isGitRemote(remote)) throw new Error();
  const branch =
    "refs/heads/" + validBranch(process.env.GIT_DATABASE_BRANCH ?? "main");
  const directory = await mkdtemp(join(tmpdir(), "myshotlog-truncate-"));
  try {
    const env = { ...process.env };
    for (const key of [
      "GIT_DIR",
      "GIT_COMMON_DIR",
      "GIT_WORK_TREE",
      "GIT_NAMESPACE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_INDEX_FILE",
    ])
      delete env[key];
    Object.assign(env, {
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "MyShotLog",
      GIT_AUTHOR_EMAIL: "journal@myshotlog.invalid",
      GIT_COMMITTER_NAME: "MyShotLog",
      GIT_COMMITTER_EMAIL: "journal@myshotlog.invalid",
    });
    const git = async (...args: string[]) => {
      const running = exec(
        "git",
        [
          "-C",
          directory,
          "-c",
          "core.hooksPath=" + devNull,
          "-c",
          "http.followRedirects=false",
          "-c",
          "protocol.ext.allow=never",
          ...args,
        ],
        { env, maxBuffer: 1_000_000, timeout: 120_000 },
      );
      running.child.stdin?.end();
      return (await running).stdout.trim();
    };
    await git("init", "--bare", "--object-format=sha1", "--template=");
    await git("remote", "add", "origin", remote);
    if (
      (await git("remote", "get-url", "--all", "origin")) !== remote ||
      (await git("remote", "get-url", "--push", "--all", "origin")) !== remote
    )
      throw new Error();

    const list = async () => {
      const refs = new Map<string, string>();
      let defaultBranch: string | undefined;
      let head: string | undefined;
      const listing = await git("ls-remote", "--symref", "origin");
      for (const line of listing.split("\n")) {
        if (!line) continue;
        const [value, ref] = line.split("\t");
        if (ref === "HEAD" && value.startsWith("ref: refs/heads/")) {
          defaultBranch =
            "refs/heads/" + validBranch(value.slice("ref: refs/heads/".length));
          continue;
        }
        if (ref === "HEAD") {
          head = value;
          continue;
        }
        if (ref?.endsWith("^{}")) continue;
        if (
          !ref ||
          !/^refs\/[^\s\x00-\x1f\x7f:\[*?]+$/.test(ref) ||
          !/^[0-9a-f]{40}$/.test(value) ||
          refs.has(ref)
        )
          throw new Error();
        refs.set(ref, value);
      }
      if (head && (!defaultBranch || refs.get(defaultBranch) !== head))
        throw new Error();
      return { refs, defaultBranch };
    };

    const { refs, defaultBranch } = await list();
    if (!refs.size) return;
    const retained = new Set([branch, defaultBranch ?? branch]);
    const changes = new Set([...refs.keys(), ...retained]);
    // Never split a destructive update across multiple pushes.
    if (changes.size > 256) throw new Error();

    const emptyTree = await git("mktree");
    const root = await git(
      "commit-tree",
      emptyTree,
      "-m",
      "MyShotLog: truncate journal",
    );
    const leases = [...changes].map(
      (ref) => "--force-with-lease=" + ref + ":" + (refs.get(ref) ?? ""),
    );
    const refspecs = [...changes].map(
      (ref) => (retained.has(ref) ? root : "") + ":" + ref,
    );
    if (Buffer.byteLength([...leases, ...refspecs].join("\n")) > 24_000)
      throw new Error();
    try {
      await git(
        "push",
        "--atomic",
        "--no-follow-tags",
        ...leases,
        "origin",
        ...refspecs,
      );
      const after = (await list()).refs;
      if (
        after.size !== retained.size ||
        [...retained].some((ref) => after.get(ref) !== root)
      )
        throw new Error();
    } catch {
      throw new RemoteTruncateUnverified();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
