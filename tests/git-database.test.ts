import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitRemoteDatabase } from "../lib/git-database/git-remote";
import { GitJournalStore, RecordNotFound } from "../lib/git-database/store";
import {
  DatabaseConflict,
  validPath,
  validBranch,
} from "../lib/git-database/types";
import { exportRecords, parseImport } from "../lib/portability";
import { profile, firearm, session } from "./fixtures";
const exec = promisify(execFile),
  owner = "20000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002";
let dir: string, db: GitRemoteDatabase, store: GitJournalStore;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "myshotlog test-"));
  await exec("git", ["init", "--bare", dir]);
  db = new GitRemoteDatabase({ remote: dir, branch: "main" });
  store = new GitJournalStore(db, owner);
});
afterEach(async () => {
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});
const git = async (...args: string[]) =>
  (await exec("git", ["-C", dir, ...args])).stdout.trim();
it("creates one commit per save, captures snapshots and preserves revision audit", async () => {
  await store.mutate("profile", profile);
  await store.mutate("firearm", firearm);
  const saved = await store.mutate("session", session);
  expect(saved.commits).toHaveLength(1);
  expect(await git("rev-list", "--count", "main")).toBe("3");
  const before = await store.records();
  expect(before.assessments.length).toBeGreaterThan(0);
  await store.mutate("firearm", {
    ...firearm,
    model: "Changed",
    archived: true,
  });
  await store.mutate("session", {
    ...session,
    revision: 2,
    results: [{ ...session.results[0], id: crypto.randomUUID(), points: 40 }],
  });
  const after = await store.records();
  expect(after.sessions[0].firearmSnapshot?.model).toBe("Test");
  expect(after.assessments).toHaveLength(3);
  expect(after.assessments[0].revision).toBe(2);
  expect(parseImport(exportRecords(after)).assessments).toEqual(
    after.assessments,
  );
  await expect(store.mutate("session", session)).rejects.toBeInstanceOf(
    DatabaseConflict,
  );
  expect(
    await git(
      "show",
      saved.head +
        ":skytte/v1/users/" +
        owner +
        "/sessions/" +
        session.id +
        ".json",
    ),
  ).toContain("revision");
  expect(
    await git(
      "show",
      saved.head +
        ":skytte/v1/users/" +
        owner +
        "/sessions/" +
        session.id +
        ".json",
    ),
  ).not.toContain(firearm.serial);
});
it("imports each entry in its own commit and skips duplicate imports", async () => {
  const data = exportRecords({
    profile,
    firearms: [firearm],
    sessions: [session],
    assessments: [],
  });
  const receipt = await store.mutate("import", data);
  expect(receipt.commits).toHaveLength(3);
  expect(receipt.imported).toBe(1);
  for (const sha of receipt.commits)
    expect(
      (
        await git(
          "diff-tree",
          "--root",
          "--no-commit-id",
          "--name-only",
          "-r",
          sha,
        )
      ).split("\n"),
    ).toHaveLength(1);
  expect((await store.mutate("import", data)).commits).toEqual([]);
  expect(await git("rev-parse", "main")).toBe(receipt.head);
});
it("isolates users and removes current records while retaining history", async () => {
  await store.mutate("firearm", firearm);
  const receipt = await store.mutate("session", session);
  const second = new GitJournalStore(db, other);
  expect((await second.records()).sessions).toEqual([]);
  await expect(
    second.mutate("delete-session", { id: session.id }),
  ).rejects.toBeInstanceOf(RecordNotFound);
  await second.mutate("profile", { ...profile, displayName: "Other" });
  await store.mutate("delete-records", { confirm: "RADERA" });
  expect((await store.records()).sessions).toEqual([]);
  expect((await second.records()).profile.displayName).toBe("Other");
  expect(
    await git(
      "show",
      receipt.head +
        ":skytte/v1/users/" +
        owner +
        "/sessions/" +
        session.id +
        ".json",
    ),
  ).toContain(session.id);
});
it("rejects stale branch writes and retries concurrent saves without losing entries", async () => {
  const snapshot = await db.snapshot("skytte");
  await db.publish(snapshot, [
    { message: "first", changes: [{ path: "README.md", content: "Keep me" }] },
  ]);
  await expect(
    db.publish(snapshot, [
      { message: "stale", changes: [{ path: "other.json", content: "bad" }] },
    ]),
  ).rejects.toBeInstanceOf(DatabaseConflict);
  const second = new GitJournalStore(db, other);
  await Promise.all([
    store.mutate("profile", profile),
    second.mutate("profile", profile),
  ]);
  expect((await store.records()).profile).toEqual(profile);
  expect((await second.records()).profile).toEqual(profile);
  expect(await git("show", "main:README.md")).toBe("Keep me");
});
it("fails closed on corrupt data and unsafe paths", async () => {
  const snapshot = await db.snapshot("skytte");
  const receipt = await db.publish(snapshot, [
    {
      message: "bad",
      changes: [
        {
          path: "skytte/v1/users/" + owner + "/profile.json",
          content: "invalid",
        },
      ],
    },
  ]);
  await expect(store.mutate("profile", profile)).rejects.toThrow();
  expect(await git("rev-parse", "main")).toBe(receipt.head);
  for (const path of ["../x", "/x", "x/../y", "x\\y"])
    expect(() => validPath(path)).toThrow();
  expect(() => validBranch("main..other")).toThrow();
});
it("rejects removed reassessment actions and leaves the branch unchanged when publication is rejected", async () => {
  await store.mutate("firearm", firearm);
  await store.mutate("session", session);
  await expect(store.mutate("reassess", { id: session.id })).rejects.toThrow();
  const receipt = { head: await git("rev-parse", "main") };
  // Native Git rejection works on Windows, macOS and Linux without shell hooks.
  await git("config", "--local", "receive.maxInputSize", "1");
  expect(await git("config", "--local", "--get", "receive.maxInputSize")).toBe(
    "1",
  );
  await expect(
    store.mutate(
      "import",
      exportRecords({
        profile,
        firearms: [{ ...firearm, id: crypto.randomUUID() }],
        sessions: [],
        assessments: [],
      }),
    ),
  ).rejects.toThrow();
  expect(await git("rev-parse", "main")).toBe(receipt.head);
  expect((await store.records()).firearms).toHaveLength(1);
});
it("persists birth dates and keeps old series frozen after profile corrections", async () => {
  await store.mutate("profile", { ...profile, birthDate: "1990-02-03" });
  await store.mutate("firearm", firearm);
  await store.mutate("session", {
    ...session,
    results: [{ ...session.results[0], points: 45 }],
  });
  const first = await store.records();
  expect(first.profile.birthDate).toBe("1990-02-03");
  expect(first.assessments[2].status).toBe("not-met");
  await store.mutate("profile", {
    ...profile,
    birthDate: "1960-12-31",
    birthYear: null,
  });
  expect((await store.records()).assessments).toEqual(first.assessments);
  const checked = await store.records();
  expect(checked.assessments.at(-1)?.status).toBe("not-met");
  expect(checked.assessments.at(-1)?.input).toEqual(first.assessments[2].input);
  await store.mutate("session", {
    ...session,
    revision: 2,
    results: [
      { ...session.results[0], points: 45 },
      { ...session.results[0], id: crypto.randomUUID(), points: 45 },
    ],
  });
  const after = await store.records();
  expect(after.assessments.at(-4)?.status).toBe("not-met");
  expect(after.assessments.at(-1)?.status).toBe("met");
  expect(parseImport(exportRecords(after)).profile.birthDate).toBe(
    "1960-12-31",
  );
});
it("persists shared session conditions and firearm default sport without changing old assessments", async () => {
  await store.mutate("profile", profile);
  await store.mutate("firearm", { ...firearm, defaultDiscipline: "precision" });
  await store.mutate("session", session);
  const before = await store.records();
  await store.mutate("session", {
    ...session,
    revision: 2,
    distance: 25,
    target: "precision25",
  });
  const after = await store.records();
  expect(after.firearms[0].defaultDiscipline).toBe("precision");
  expect(after.sessions[0]).toMatchObject({
    distance: 25,
    target: "precision25",
  });
  expect(after.sessions[0].results[0].distance).toBeUndefined();
  expect(after.sessions[0].firearmSnapshot).not.toHaveProperty(
    "defaultDiscipline",
  );
  expect(after.assessments.at(-1)?.input).toEqual(before.assessments[2].input);
  expect(parseImport(exportRecords(after)).sessions[0]).toEqual(
    after.sessions[0],
  );
});
it("calculates legacy sessions on read without commits or reassessment", async () => {
  const raw = { ...session.results[0], points: 45 };
  await store.mutate(
    "import",
    exportRecords({
      profile,
      firearms: [firearm],
      sessions: [{ ...session, results: [raw] }],
      assessments: [],
    }),
  );
  const head = await git("rev-parse", "main");
  const records = await store.records();
  expect(records.assessments).toHaveLength(3);
  expect(records.assessments[2].status).toBe("not-met");
  expect(records.assessments[1].status).toBe("met");
  await store.records();
  expect(await git("rev-parse", "main")).toBe(head);
});

it("preserves multibyte UTF-8 journal data across Git output chunks", async () => {
  const content = "ÅÄÖ 🎯".repeat(20_000);
  await db.publish(await db.snapshot("journal"), [
    {
      message: "UTF-8 fixture",
      changes: [{ path: "journal/utf8.txt", content }],
    },
  ]);
  expect((await db.snapshot("journal")).files.get("journal/utf8.txt")).toBe(
    content,
  );
});
it("stores a language change in profile.json without changing user-entered text", async () => {
  const input = {
    ...profile,
    language: "en" as const,
    displayName: "Översikt",
  };
  await store.mutate("profile", input);
  expect((await store.records()).profile).toMatchObject({
    language: "en",
    displayName: "Översikt",
  });
  expect(
    JSON.parse(
      await git("show", "main:skytte/v1/users/" + owner + "/profile.json"),
    ).entry.language,
  ).toBe("en");
});
