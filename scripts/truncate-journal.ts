import { execFile } from "node:child_process";
import { lstat, realpath, readdir, rm } from "node:fs/promises";
import { devNull } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { validBranch } from "../lib/git-database/types";

const exec = promisify(execFile);

export class PurgeIncomplete extends Error {}

async function checkStorage(path: string, depth: number) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
    throw new Error();
  if (stat.isDirectory()) {
    if (!depth) throw new Error();
    for (const name of await readdir(path)) {
      if (name.endsWith(".lock")) throw new Error();
      await checkStorage(join(path, name), depth - 1);
    }
  }
}

async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

export async function truncateJournal(
  repository: string,
  confirmation: string,
) {
  if (!isAbsolute(repository) || !isAbsolute(confirmation)) throw new Error();
  const directory = await realpath(repository);
  if ((await realpath(confirmation)) !== directory) throw new Error();

  const branch = validBranch(process.env.GIT_DATABASE_BRANCH ?? "main");
  const env = { ...process.env };
  // Ignore Git overrides that could redirect refs or objects to another repo.
  for (const name of Object.keys(env))
    if (name.toUpperCase().startsWith("GIT_")) delete env[name];
  env.GIT_CONFIG_GLOBAL = devNull;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_NO_LAZY_FETCH = "1";
  const git = async (args: string[], input?: string) => {
    const running = exec(
      "git",
      [
        "--git-dir=" + directory,
        "-c",
        "core.hooksPath=" + devNull,
        "-c",
        "gc.auto=0",
        ...args,
      ],
      { env, maxBuffer: 8_000_000 },
    );
    if (input !== undefined) {
      running.child.stdin?.on("error", () => {});
      running.child.stdin?.end(input);
    }
    return (await running).stdout.trimEnd();
  };

  const layout = await git([
    "rev-parse",
    "--is-bare-repository",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const [bare, common] = layout.split(/\r?\n/);
  if (bare !== "true" || !common || (await realpath(common)) !== directory)
    throw new Error();
  if (
    (await exists(join(directory, "HEAD.lock"))) ||
    (await exists(join(directory, "packed-refs.lock"))) ||
    (await exists(join(directory, "worktrees"))) ||
    (await exists(join(directory, "index"))) ||
    (await exists(join(directory, "objects", "info", "alternates"))) ||
    (await exists(join(directory, "objects", "info", "http-alternates"))) ||
    (await exists(join(directory, "shallow")))
  )
    throw new Error();
  // Git follows parts of the on-disk layout. Refuse linked storage before any
  // command that could expire a reflog or prune objects in another repository.
  for (const name of [
    "HEAD",
    "refs",
    "reftable",
    "packed-refs",
    "logs",
    "objects",
  ]) {
    const path = join(directory, name);
    if (await exists(path)) await checkStorage(path, 64);
  }
  const packs = await readdir(join(directory, "objects", "pack"));
  if (packs.some((pack) => /\.(keep|promisor)$/.test(pack))) throw new Error();

  const listRefs = () =>
    git(["for-each-ref", "--format=%(refname) %(objectname) %(symref)"]);
  const refs = await listRefs();
  try {
    if (refs) {
      const deletes = refs.split(/\r?\n/).map((line) => {
        const [ref, oid, symbolic] = line.split(" ");
        return "option no-deref\ndelete " + ref + (symbolic ? "" : " " + oid);
      });
      await git(
        ["update-ref", "--stdin"],
        ["start", ...deletes, "prepare", "commit", ""].join("\n"),
      );
    }
    await git(["symbolic-ref", "HEAD", "refs/heads/" + branch]);
    await git([
      "reflog",
      "expire",
      "--expire=all",
      "--expire-unreachable=all",
      "--all",
    ]);
    // The files backend can retain orphaned reflog files after a ref goes away.
    await rm(join(directory, "logs"), { recursive: true, force: true });
    await git(["gc", "--prune=now"]);
    if (
      (await listRefs()) ||
      (await git([
        "cat-file",
        "--batch-all-objects",
        "--batch-check=%(objectname)",
        "--unordered",
      ]))
    )
      throw new Error();
  } catch {
    throw new PurgeIncomplete();
  }
}
