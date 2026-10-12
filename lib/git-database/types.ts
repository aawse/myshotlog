import { swText } from "@/lib/i18n";
export class DatabaseConflict extends Error {
  constructor(message = swText("store.conflict")) {
    super(message);
    this.name = "DatabaseConflict";
  }
}
export class DatabaseUnavailable extends Error {
  constructor(message = swText("store.unavailable")) {
    super(message);
    this.name = "DatabaseUnavailable";
  }
}
export type GitSnapshot = {
  head: string | null;
  files: ReadonlyMap<string, string>;
};
export type GitChange = { path: string; content: string | null };
export type EntryCommit = { message: string; changes: GitChange[] };
export type CommitReceipt = { head: string | null; commits: string[] };
export interface GitDatabase {
  snapshot(prefix: string): Promise<GitSnapshot>;
  // Optional bounded cache for display/export reads; never use for transactions.
  readSnapshot?(prefix: string): Promise<GitSnapshot>;
  publish(
    snapshot: GitSnapshot,
    entries: EntryCommit[],
  ): Promise<CommitReceipt>;
}
export function validPath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\x00-\x1f\x7f]/.test(path)
  )
    throw new Error("Invalid repository path");
  return path;
}
export function validBranch(branch: string) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9/._-]*$/.test(branch) ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.split("/").some((p) => p.startsWith(".") || p.endsWith(".lock"))
  )
    throw new Error("Invalid database branch");
  return branch;
}
