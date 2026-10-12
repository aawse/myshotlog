import { createHash } from "node:crypto";
import { ReadCachedDatabase } from "./read-cache";
import { swText } from "@/lib/i18n";
import "server-only";
import { GitHubDatabase } from "./github";
import { GitRemoteDatabase } from "./git-remote";
import { DatabaseUnavailable, validPath, type GitDatabase } from "./types";
export function databaseConfigured() {
  return process.env.GIT_DATABASE_PROVIDER === "git"
    ? Boolean(process.env.GIT_DATABASE_REMOTE)
    : Boolean(
        process.env.GIT_DATABASE_REPOSITORY && process.env.GIT_DATABASE_TOKEN,
      );
}
export function databasePrefix() {
  return validPath(process.env.GIT_DATABASE_PREFIX ?? "myshotlog/v1");
}
let cached: { key: string; provider: GitDatabase } | undefined;
export function database(): GitDatabase {
  const seconds = Number(process.env.GIT_DATABASE_READ_CACHE_SECONDS ?? "15");
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 300)
    throw new Error(
      "GIT_DATABASE_READ_CACHE_SECONDS must be an integer from 0 to 300",
    );
  // Credential changes must never reuse previously authorized data.
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        process.env.GIT_DATABASE_PROVIDER,
        process.env.GIT_DATABASE_REPOSITORY,
        process.env.GIT_DATABASE_REMOTE,
        process.env.GIT_DATABASE_BRANCH,
        process.env.GIT_DATABASE_TOKEN,
        process.env.GIT_DATABASE_API_URL,
        seconds,
      ]),
    )
    .digest("hex");
  if (!cached || cached.key !== key)
    cached = {
      key,
      provider: new ReadCachedDatabase(createDatabase(), seconds * 1000),
    };
  return cached.provider;
}
function createDatabase(): GitDatabase {
  const branch = process.env.GIT_DATABASE_BRANCH ?? "main";
  if (process.env.GIT_DATABASE_PROVIDER === "git")
    return new GitRemoteDatabase({
      remote: process.env.GIT_DATABASE_REMOTE ?? "",
      branch,
    });
  if (
    process.env.GIT_DATABASE_PROVIDER &&
    process.env.GIT_DATABASE_PROVIDER !== "github"
  )
    throw new DatabaseUnavailable(swText("store.adapter"));
  return new GitHubDatabase({
    repository: process.env.GIT_DATABASE_REPOSITORY ?? "",
    branch,
    token: process.env.GIT_DATABASE_TOKEN ?? "",
    apiUrl: process.env.GIT_DATABASE_API_URL,
  });
}
