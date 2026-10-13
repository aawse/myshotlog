import { it, expect } from "vitest";
import { GitJournalStore } from "../lib/git-database/store";
import { exportRecords, parseImport } from "../lib/portability";
import { t } from "../lib/i18n";
import sharp from "sharp";
import {
  WitnessStore,
  WitnessUnavailable,
  witnessClaims,
  validateSignature,
  validateSignoff,
} from "../lib/witness/store";
import { reviewSession, witnessCurrent } from "../lib/witness/model";
import { DatabaseConflict, type GitDatabase } from "../lib/git-database/types";
import { session, result, profile } from "./fixtures";
const owner = "20000000-0000-4000-8000-000000000001",
  prefix = "myshotlog/test",
  secret = "s".repeat(32),
  origin = "https://example.test";
function fixture() {
  let head = 0,
    now = Date.parse("2026-10-13T12:00:00Z");
  const path = prefix + "/users/" + owner;
  const files = new Map([
    [
      path + "/sessions/" + session.id + ".json",
      JSON.stringify({ version: 1, entry: session, assessments: [] }),
    ],
  ]);
  const db: GitDatabase = {
    async snapshot(scope) {
      return {
        head: String(head),
        files: new Map(
          [...files].filter(
            ([key]) => key.startsWith(scope + "/") || key === scope,
          ),
        ),
      };
    },
    async publish(snapshot, entries) {
      if (snapshot.head !== String(head)) throw new DatabaseConflict();
      for (const entry of entries)
        for (const c of entry.changes) {
          if (c.content === null) files.delete(c.path);
          else files.set(c.path, c.content);
        }
      head++;
      return { head: String(head), commits: [String(head)] };
    },
  };
  return {
    store: new WitnessStore(db, owner, prefix, secret, origin, "1", () => now),
    files,
    db,
    path,
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    edit: (points: number) => {
      files.set(
        path + "/sessions/" + session.id + ".json",
        JSON.stringify({
          entry: { ...session, results: [{ ...result, points }] },
        }),
      );
      head++;
    },
  };
}
async function signature(blank = false) {
  const pixels = Buffer.alloc(800 * 300, 255);
  if (!blank)
    for (let x = 80; x < 600; x++) {
      pixels[140 * 800 + x] = 0;
      pixels[141 * 800 + x] = 0;
    }
  return {
    mediaType: "image/png" as const,
    width: 800,
    height: 300,
    data: (
      await sharp(pixels, { raw: { width: 800, height: 300, channels: 1 } })
        .png()
        .toBuffer()
    ).toString("base64"),
  };
}
it("reveals only the reviewed scope and keeps raw bearer tokens out of Git", async () => {
  const f = fixture();
  const { token } = await f.store.create(session.id, result.id);
  const view = await f.store.preview(token);
  expect(view.snapshot.results).toHaveLength(1);
  expect(JSON.stringify(view)).not.toMatch(
    /birthDate|birthYear|displayName|serial|notes|photoId/,
  );
  expect([...f.files.values()].join()).not.toContain(token);
  expect(view.snapshot.firearm).not.toHaveProperty("id");
  expect(view.snapshot).toEqual(reviewSession(session, result.id));
});
it("publishes a signature and consumes its grant atomically, allowing only one concurrent signer", async () => {
  const f = fixture();
  const { token } = await f.store.create(session.id, null);
  const image = await signature();
  const attempts = await Promise.allSettled([
    f.store.sign(token, "First", "sv", image),
    f.store.sign(token, "Second", "en", image),
  ]);
  expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(
    [...f.files.keys()].filter((x) => x.includes("witness-signoffs")),
  ).toHaveLength(1);
  await expect(f.store.preview(token)).rejects.toBeInstanceOf(
    WitnessUnavailable,
  );
  const entry = JSON.parse(
    [...f.files.entries()].find(([path]) =>
      path.includes("witness-signoffs"),
    )![1],
  );
  expect(entry.signedAt).toBe(new Date(f.clock()).toISOString());
  expect(entry.statement).toBe(t(entry.statementLanguage, "witness.statement"));
  expect(witnessCurrent(entry, session)).toBe(true);
  expect(
    witnessCurrent(entry, { ...session, results: [{ ...result, points: 45 }] }),
  ).toBe(false);
  expect(
    witnessCurrent(entry, { ...session, notes: "Changed note", revision: 2 }),
  ).toBe(true);
  await expect(validateSignoff(entry)).resolves.toMatchObject({ id: entry.id });
  await expect(
    validateSignoff({ ...entry, digest: "0".repeat(64) }),
  ).rejects.toThrow();
});
it("rejects changed scores before signing and preserves the pending grant", async () => {
  const f = fixture();
  const { token } = await f.store.create(session.id, null);
  f.edit(45);
  await expect(
    f.store.sign(token, "Witness", "en", await signature()),
  ).rejects.toBeInstanceOf(WitnessUnavailable);
  expect(
    [...f.files.values()].some((x) => x.includes('"status":"pending"')),
  ).toBe(true);
});
it("supports multiple witnesses and cancellation without changing medal records", async () => {
  const f = fixture();
  const original = f.files.get(f.path + "/sessions/" + session.id + ".json");
  for (let n = 0; n < 2; n++) {
    const { token } = await f.store.create(session.id, null);
    await f.store.sign(token, "Witness " + n, "en", await signature());
  }
  const invite = await f.store.create(session.id, result.id);
  await f.store.cancel(invite.invitation.id);
  await expect(f.store.preview(invite.token)).rejects.toBeInstanceOf(
    WitnessUnavailable,
  );
  expect(f.files.get(f.path + "/sessions/" + session.id + ".json")).toBe(
    original,
  );
  expect(
    [...f.files.keys()].filter((x) => x.includes("witness-signoffs")),
  ).toHaveLength(2);
});
it("rejects expired, tampered, foreign-origin and wrong-owner invitations", async () => {
  const f = fixture();
  const { token } = await f.store.create(session.id, null);
  expect(() =>
    witnessClaims(token, secret, "https://other.test", f.clock()),
  ).toThrow();
  expect(() => witnessClaims(token + "x", secret, origin, f.clock())).toThrow();
  const other = new WitnessStore(
    f.db,
    "20000000-0000-4000-8000-000000000002",
    prefix,
    secret,
    origin,
    "2",
    f.clock,
  );
  await expect(other.preview(token)).rejects.toThrow();
  f.advance(86400000);
  await expect(f.store.preview(token)).rejects.toThrow();
});
it("validates signature image bytes, bounds and nonblank pixels", async () => {
  await expect(validateSignature(await signature())).resolves.toMatchObject({
    mediaType: "image/png",
  });
  await expect(validateSignature(await signature(true))).rejects.toThrow();
  await expect(
    validateSignature({ ...(await signature()), width: 799 }),
  ).rejects.toThrow();
  await expect(
    validateSignature({
      ...(await signature()),
      data: Buffer.from("<svg/>").toString("base64"),
    }),
  ).rejects.toThrow();
});
it("keeps a series sign-off current when other series change, while a session sign-off changes", () => {
  const a = reviewSession(session, result.id),
    b = reviewSession(session, null);
  const next = {
    ...session,
    results: [
      result,
      { ...result, id: "30000000-0000-4000-8000-000000000001", points: 40 },
    ],
  };
  expect(reviewSession(next, result.id)).toEqual(a);
  expect(reviewSession(next, null)).not.toEqual(b);
  expect(profile.birthYear).not.toBeNull();
});

it("backs up and imports sign-offs without live invitations, then removes them with the session", async () => {
  const f = fixture();
  const invite = await f.store.create(session.id, null);
  await f.store.sign(invite.token, "Witness", "en", await signature());
  const journal = new GitJournalStore(f.db, owner, prefix);
  const data = await journal.records();
  expect(data.witnessSignoffs).toHaveLength(1);
  const backup = exportRecords({
    ...data,
    firearms: [await import("./fixtures").then((m) => m.firearm)],
  });
  const parsed = parseImport(backup);
  expect(parsed.witnessSignoffs).toHaveLength(1);
  expect(JSON.stringify(backup)).not.toContain(invite.token);
  const otherOwner = "20000000-0000-4000-8000-000000000002";
  const imported = new GitJournalStore(f.db, otherOwner, prefix);
  await imported.mutate("import", backup);
  expect((await imported.records()).witnessSignoffs).toEqual(
    data.witnessSignoffs,
  );
  await journal.mutate("delete-session", { id: session.id });
  expect(
    [...f.files.keys()].filter((path) => path.startsWith(f.path + "/witness-")),
  ).toEqual([]);
});
