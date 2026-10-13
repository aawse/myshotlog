import { expect, it, vi } from "vitest";
import { buildCommit } from "../lib/build-commit";
const commit = "a".repeat(40);
it("uses Vercel build metadata without requiring a Git executable", () => {
  const git = vi.fn(() => {
    throw new Error("Git unavailable");
  });
  expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: commit }, git)).toBe(commit);
  expect(git).not.toHaveBeenCalled();
});
it("captures the checkout commit for builds outside Vercel", () => {
  expect(buildCommit({}, () => commit + "\n")).toBe(commit);
});
it("falls back to Git when Vercel metadata is invalid", () => {
  expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: "invalid" }, () => commit)).toBe(
    commit,
  );
});
it("does not invent a revision when neither build metadata nor Git is available", () => {
  expect(
    buildCommit({}, () => {
      throw new Error("No checkout");
    }),
  ).toBe("");
  expect(buildCommit({}, () => "invalid")).toBe("");
});
