import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it } from "vitest";
import { journalOwner } from "../lib/auth/session";
import { GitRemoteDatabase } from "../lib/git-database/git-remote";
import { GitJournalStore } from "../lib/git-database/store";
import { parseImport } from "../lib/portability";
import { emptyRecords, targetsFor, type Operation } from "../lib/sync/model";
import { createHash } from "node:crypto";
import { createBackup } from "../lib/transfer-browser";
import { TRANSFER_MAX_BYTES } from "../lib/transfer-limits";
import { firearm, profile, result, session } from "./fixtures";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/journal.mjs", import.meta.url));
const owner = "20000000-0000-4000-8000-000000000001";
const branch = "journal";
let workspace: string,
  remote: string,
  db: GitRemoteDatabase,
  input: string,
  output: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "myshotlog-cli-"));
  remote = join(workspace, "journal.git");
  input = join(workspace, "input.json");
  output = join(workspace, "output.json");
  await exec("git", ["init", "--bare", remote]);
  db = new GitRemoteDatabase({ remote, branch });
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function run(command: string, path: string, githubId = "101") {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("GIT_DATABASE_") && !key.startsWith("GITHUB_"),
    ),
  );
  return exec(
    process.execPath,
    [cli, command, path, "--github-id", githubId, "--language", "en"],
    {
      env: {
        ...env,
        NODE_ENV: "test",
        GIT_DATABASE_PROVIDER: "git",
        GIT_DATABASE_REMOTE: remote,
        GIT_DATABASE_BRANCH: branch,
        GITHUB_ALLOWED_USER_IDS: "101,202",
        GITHUB_USER_ID_MAP: JSON.stringify({ "101": owner }),
      },
    },
  );
}

it("merges a browser journal download idempotently and exports a reimportable, owner-only snapshot", async () => {
  const origin = new GitJournalStore(db, journalOwner("202"));
  const target = new GitJournalStore(db, owner, "skytte/v1");
  await origin.mutate("profile", profile);
  await origin.mutate("firearm", firearm);
  const photo = {
    id: crypto.randomUUID(),
    data: (
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#fafafa" },
      })
        .jpeg()
        .toBuffer()
    ).toString("base64"),
  };
  await origin.mutate("session", session);
  await origin.mutate(
    "quick-entry",
    {
      id: photo.id,
      date: session.date,
      discipline: session.discipline,
      result: {
        id: photo.id,
        label: result.label,
        type: result.type,
        shots: result.shots,
        points: result.points,
        photoId: photo.id,
      },
      notes: "",
    },
    [photo],
  );
  const backup = await createBackup(
    await origin.records(),
    "json",
    "en",
    async () => Response.json((await origin.photos())[0]),
  );
  await writeFile(input, await backup.text());
  await target.mutate("profile", { ...profile, birthYear: 2000 });
  await run("sync", input);
  const imported = await db.snapshot("skytte/v1/users/" + owner);
  await run("sync", input);
  expect((await db.snapshot("skytte/v1/users/" + owner)).head).toBe(
    imported.head,
  );
  await origin.mutate("firearm", { ...firearm, id: crypto.randomUUID() });
  const beforeExport = await target.syncSnapshot();
  await run("export", output);
  const raw = await readFile(output, "utf8");
  const exported = parseImport(JSON.parse(raw));
  expect(exported.sessions.map(({ id }) => id)).toEqual([session.id]);
  expect(exported.firearms.map(({ id }) => id)).toEqual([firearm.id]);
  expect(exported.quickEntries.map(({ id }) => id)).toEqual([photo.id]);
  expect(exported.recordingContexts[0].birthYear).toBe(profile.birthYear);
  expect(exported.profile.birthYear).toBe(2000);
  expect(exported.photos).toEqual(await origin.photos());
  expect(JSON.parse(raw)).not.toHaveProperty("assessments");
  await expect(run("export", output)).rejects.toMatchObject({ code: 1 });
  expect(await readFile(output, "utf8")).toBe(raw);
  expect(await target.syncSnapshot()).toEqual(beforeExport);
  const restored = new GitJournalStore(db, crypto.randomUUID());
  await restored.mutate("import", JSON.parse(raw));
  expect((await restored.records()).sessions.map(({ id }) => id)).toEqual([
    session.id,
  ]);
  expect(await restored.photos()).toEqual(exported.photos);
});

function operation(action: Operation["action"], payload: unknown): Operation {
  return {
    id: crypto.randomUUID(),
    action,
    payload,
    photos: [],
    recording: {
      recordedAt: "2026-10-10T10:00:00Z",
      birthDate: null,
      birthYear: 1990,
    },
    base: targetsFor(action, payload, emptyRecords()),
  };
}

async function writePending(operations: Operation[]) {
  const scope = createHash("sha256")
    .update(JSON.stringify([owner, "git", null, remote, null, branch, "auto"]))
    .digest("hex");
  await writeFile(
    input,
    JSON.stringify({
      format: "myshotlog-pending",
      version: 1,
      scope,
      operations,
      photos: {},
    }),
  );
}

it("replays pending operations once, denies a different owner and publishes no partial batch on conflict", async () => {
  const profileUpdate = operation("profile", profile);
  const firearmUpdate = operation("firearm", firearm);
  await writePending([profileUpdate, firearmUpdate]);
  await expect(run("sync", input, "202")).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("different journal"),
  });
  expect((await db.snapshot("myshotlog/v1")).head).toBeNull();
  await run("sync", input);
  const store = new GitJournalStore(db, owner);
  const saved = await store.syncSnapshot();
  expect(saved.records.firearms.map(({ id }) => id)).toEqual([firearm.id]);
  await run("sync", input);
  expect((await store.syncSnapshot()).head).toBe(saved.head);

  const nextFirearm = operation("firearm", {
    ...firearm,
    id: crypto.randomUUID(),
  });
  await writePending([
    nextFirearm,
    operation("profile", { ...profile, displayName: "Changed" }),
  ]);
  await expect(run("sync", input)).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("conflict"),
  });
  expect(await store.syncSnapshot()).toEqual(saved);
});

it("rejects malformed and oversized input and denies IDs outside the installation allowlist", async () => {
  await writeFile(input, '{"private":"fictional-secret-marker"}');
  await expect(run("sync", input)).rejects.toMatchObject({
    code: 1,
    stderr: expect.not.stringContaining("fictional-secret-marker"),
  });
  await truncate(input, TRANSFER_MAX_BYTES + 1);
  await expect(run("sync", input)).rejects.toMatchObject({ code: 1 });
  await expect(run("export", output, "303")).rejects.toMatchObject({ code: 1 });
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await db.snapshot("myshotlog/v1")).head).toBeNull();
});
