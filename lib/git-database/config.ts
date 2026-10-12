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
  return validPath(process.env.GIT_DATABASE_PREFIX ?? "skytte/v1");
}
export function database(): GitDatabase {
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
