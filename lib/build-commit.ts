import { execFileSync } from "node:child_process";

// Build-time only: never query the checkout or remote to identify a running build.
export function buildCommit(
  environment: { VERCEL_GIT_COMMIT_SHA?: string } = {
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  },
  readGitCommit: () => string = () =>
    execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }),
): string {
  const valid = (value: string | undefined) =>
    value && /^[a-f0-9]{40}$/.test(value) ? value : "";
  const vercel = valid(environment.VERCEL_GIT_COMMIT_SHA);
  if (vercel) return vercel;
  try {
    return valid(readGitCommit().trim());
  } catch {
    return "";
  }
}
