import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, access, writeFile, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
const temporaryDirectories = vi.hoisted(() => [] as string[]);
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    mkdtemp: async (prefix: string) => {
      const directory = await fs.mkdtemp(prefix);
      if (prefix.endsWith("skytte-git-")) temporaryDirectories.push(directory);
      return directory;
    },
  };
});
import { GitRemoteDatabase } from "../lib/git-database/git-remote";
import { DatabaseUnavailable } from "../lib/git-database/types";
import { optimizeTargetPhoto } from "../lib/photos/server";
const exec = promisify(execFile);
let remote: string, db: GitRemoteDatabase;
beforeEach(async () => {
  temporaryDirectories.length = 0;
  remote = await mkdtemp(join(tmpdir(), "myshotlog-photo-cleanup-"));
  await exec("git", ["init", "--bare", remote]);
  db = new GitRemoteDatabase({ remote, branch: "main" });
});
afterEach(async () => {
  await rm(remote, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
  for (const directory of temporaryDirectories)
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
});
async function assertCleaned() {
  expect(temporaryDirectories.length).toBeGreaterThan(0);
  for (const directory of temporaryDirectories)
    await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
}
async function photoEntry() {
  const input = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: "#eee" },
  })
    .jpeg()
    .toBuffer();
  const photo = await optimizeTargetPhoto(input);
  return {
    message: "Save test target photo",
    changes: [
      { path: "journal/photos/target.json", content: JSON.stringify(photo) },
    ],
  };
}
it("removes the temporary photo-containing Git repository after a successful push and subsequent read", async () => {
  const snapshot = await db.snapshot("journal"),
    entry = await photoEntry();
  await db.publish(snapshot, [entry]);
  await assertCleaned();
  // The remote retains the committed photo, even though the app server's temporary clone is gone.
  const saved = await db.snapshot("journal");
  expect(saved.files.get("journal/photos/target.json")).toBe(
    entry.changes[0].content,
  );
  await assertCleaned();
  expect(sharp.cache().items.max).toBe(0);
});
it("removes temporary photo objects when the remote rejects the push", async () => {
  const hooks = join(remote, "hooks");
  await mkdir(hooks, { recursive: true });
  const hook = join(hooks, "pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n");
  await chmod(hook, 0o700);
  await expect(
    db.publish(await db.snapshot("journal"), [await photoEntry()]),
  ).rejects.toBeInstanceOf(DatabaseUnavailable);
  await assertCleaned();
  const saved = await db.snapshot("journal");
  expect(saved.head).toBeNull();
});
it("removes temporary repositories after a failed read", async () => {
  const missing = new GitRemoteDatabase({
    remote: join(remote, "missing"),
    branch: "main",
  });
  await expect(missing.snapshot("journal")).rejects.toBeInstanceOf(
    DatabaseUnavailable,
  );
  await assertCleaned();
});
