import { expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  validateUploadedPhoto,
  validatePhotoAsset,
} from "../lib/photos/server";
import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from "../lib/photos/schema";
import {
  GitJournalStore,
  InvalidRecord,
  RecordNotFound,
} from "../lib/git-database/store";
import {
  DatabaseConflict,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "../lib/git-database/types";
import { exportRecords, parseImport } from "../lib/portability";
import { session } from "./fixtures";
vi.mock("../lib/data", () => ({ journal: vi.fn() }));
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: async () => ({ user: { id: "owner" } }),
}));
vi.mock("../lib/auth/security", () => ({
  securityStore: () => ({ limitApi: async () => undefined }),
}));
import { journal } from "../lib/data";
import { GET } from "../app/api/photos/[id]/route";
class MemoryDatabase implements GitDatabase {
  files = new Map<string, string>();
  revision = 0;
  fail = false;
  commits: EntryCommit[] = [];
  async snapshot(prefix: string): Promise<GitSnapshot> {
    return {
      head: String(this.revision),
      files: new Map(
        [...this.files].filter(([path]) => path.startsWith(prefix + "/")),
      ),
    };
  }
  async publish(snapshot: GitSnapshot, entries: EntryCommit[]) {
    if (this.fail) {
      this.fail = false;
      throw new DatabaseConflict();
    }
    if (snapshot.head !== String(this.revision)) throw new DatabaseConflict();
    for (const entry of entries)
      for (const change of entry.changes) {
        if (change.content === null) this.files.delete(change.path);
        else this.files.set(change.path, change.content);
      }
    this.commits.push(...entries);
    this.revision += entries.length;
    return {
      head: String(this.revision),
      commits: entries.map((_, i) => String(this.revision - i)),
    };
  }
}
const owner = "20000000-0000-4000-8000-000000000001";
function setup() {
  const db = new MemoryDatabase();
  return { db, store: new GitJournalStore(db, owner) };
}
async function draft() {
  const data = await sharp({
    create: { width: 1600, height: 960, channels: 3, background: "#f7f2da" },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { id: crypto.randomUUID(), data: data.toString("base64") };
}
const pass = { ...session, firearmId: null, firearmSnapshot: null };
it("stores the browser's optimized JPEG bytes exactly without re-encoding", async () => {
  const image = await draft(),
    input = Buffer.from(image.data, "base64"),
    photo = await validateUploadedPhoto(input);
  expect(photo.width).toBe(PHOTO_MAX_EDGE);
  expect(photo.height).toBe(960);
  expect(photo.bytes).toBe(input.length);
  expect(Buffer.from(photo.data, "base64")).toEqual(input);
  expect(await validatePhotoAsset(photo)).toEqual(photo);
});
it("rejects oversized or unoptimized uploads instead of resizing or compressing them on the server", async () => {
  await expect(
    validateUploadedPhoto(Buffer.alloc(PHOTO_MAX_BYTES + 1)),
  ).rejects.toThrow();
  const large = await sharp({
    create: { width: 2000, height: 800, channels: 3, background: "#eee" },
  })
    .jpeg()
    .toBuffer();
  await expect(validateUploadedPhoto(large)).rejects.toThrow();
  const png = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "#eee" },
  })
    .png()
    .toBuffer();
  await expect(validateUploadedPhoto(png)).rejects.toThrow();
  const metadata = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "#eee" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  await expect(validateUploadedPhoto(metadata)).rejects.toThrow();
});
it("commits a photo and its series atomically, preserving it on quick-entry linking", async () => {
  const { db, store } = setup(),
    image = await draft(),
    id = crypto.randomUUID();
  const q = {
    id,
    date: pass.date,
    discipline: pass.discipline,
    result: {
      ...pass.results[0],
      id,
      seconds: undefined,
      distance: undefined,
      target: undefined,
      photoId: image.id,
    },
    notes: "",
  };
  delete q.result.seconds;
  delete q.result.distance;
  delete q.result.target;
  db.fail = true;
  await store.mutate("quick-entry", q, [image]);
  const before = await store.records(),
    photoId = before.quickEntries![0].result.photoId!;
  expect(photoId).toMatch(/^[a-f0-9]{64}$/);
  expect(db.commits).toHaveLength(2);
  expect(db.commits[0].changes[0].path).toContain("/photos/users/" + owner);
  expect(before.photos).toBeUndefined(); // Ordinary page reads never load base64 image payloads.
  const photo = await store.photo(photoId);
  expect(photo.bytes).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  expect(photo.data).toBe(image.data);
  await store.mutate("quick-entry", q, [image]);
  expect(db.commits).toHaveLength(2);
  await store.mutate("session-with-quick", {
    ids: [id],
    session: { ...pass, results: [before.quickEntries![0].result] },
  });
  expect((await store.records()).sessions[0].results[0].photoId).toBe(photoId);
  expect(await store.photos()).toHaveLength(1);
  const other = new GitJournalStore(db, "20000000-0000-4000-8000-000000000002");
  await expect(other.photo(photoId)).rejects.toBeInstanceOf(RecordNotFound);
  await store.mutate("delete-session", { id: pass.id });
  expect(await store.photos()).toEqual([]);
});
it("deduplicates identical photos and removes a photo only after the last reference", async () => {
  const { store } = setup(),
    image = await draft();
  await store.mutate(
    "session",
    { ...pass, results: [{ ...pass.results[0], photoId: image.id }] },
    [image],
  );
  const photoId = (await store.records()).sessions[0].results[0].photoId!;
  await store.mutate("session", {
    ...pass,
    revision: 2,
    results: [
      { ...pass.results[0], photoId },
      { ...pass.results[0], id: crypto.randomUUID(), photoId },
    ],
  });
  await store.mutate("session", {
    ...(await store.records()).sessions[0],
    revision: 3,
    results: [{ ...pass.results[0], photoId }],
  });
  expect(await store.photos()).toHaveLength(1);
  await store.mutate("session", { ...pass, revision: 4 });
  expect(await store.photos()).toEqual([]);
});
it("round-trips optimized images in JSON backup and rejects corrupt or missing image data", async () => {
  const { store } = setup(),
    image = await draft();
  await store.mutate(
    "session",
    { ...pass, results: [{ ...pass.results[0], photoId: image.id }] },
    [image],
  );
  const data = { ...(await store.records()), photos: await store.photos() },
    backup = exportRecords(data);
  const restored = setup();
  await restored.store.mutate("import", backup);
  expect(await restored.store.photos()).toEqual(data.photos);
  expect(() => parseImport({ ...backup, photos: [] })).toThrow();
  await expect(
    restored.store.mutate("import", {
      ...backup,
      photos: [
        { ...data.photos[0], data: Buffer.from("corrupt").toString("base64") },
      ],
    }),
  ).rejects.toBeInstanceOf(InvalidRecord);
});
it("rejects invalid images and orphan uploads without publishing a commit", async () => {
  const { db, store } = setup();
  await expect(
    store.mutate("session", pass, [
      {
        id: crypto.randomUUID(),
        data: Buffer.from("not an image").toString("base64"),
      },
    ]),
  ).rejects.toBeInstanceOf(InvalidRecord);
  await expect(
    store.mutate("session", pass, [await draft()]),
  ).rejects.toBeInstanceOf(InvalidRecord);
  expect(db.commits).toEqual([]);
});
it("requires authentication to read a photo and serves only the owner's optimized JPEG", async () => {
  vi.mocked(journal).mockRejectedValueOnce(new Error("AUTH_REQUIRED"));
  expect(
    (
      await GET(new Request("http://localhost"), {
        params: Promise.resolve({ id: "a".repeat(64) }),
      })
    ).status,
  ).toBe(401);
  const { store } = setup(),
    image = await draft();
  await store.mutate(
    "session",
    { ...pass, results: [{ ...pass.results[0], photoId: image.id }] },
    [image],
  );
  vi.mocked(journal).mockResolvedValue(store);
  const photo = (await store.photos())[0],
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: photo.id }),
    });
  expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(
    Buffer.from(photo.data, "base64"),
  );
});

it("preserves legacy WebP photos through import, export, and private reads", async () => {
  const { createHash } = await import("node:crypto");
  const input = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#eee" },
  })
    .webp()
    .toBuffer();
  const photo = await validatePhotoAsset({
    id: createHash("sha256").update(input).digest("hex"),
    mediaType: "image/webp",
    width: 800,
    height: 600,
    bytes: input.length,
    data: input.toString("base64"),
  });
  const { store } = setup();
  await store.mutate(
    "import",
    exportRecords({
      profile: {
        displayName: "Test",
        birthDate: null,
        birthYear: null,
        language: "sv",
        timezone: "Europe/Stockholm",
      },
      firearms: [],
      sessions: [
        { ...pass, results: [{ ...pass.results[0], photoId: photo.id }] },
      ],
      assessments: [],
      photos: [photo],
    }),
  );
  expect(await store.photos()).toEqual([photo]);
  expect(
    parseImport(
      exportRecords({
        ...(await store.records()),
        photos: await store.photos(),
      }),
    ).photos,
  ).toEqual([photo]);
  vi.mocked(journal).mockResolvedValue(store);
  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ id: photo.id }),
  });
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(input);
  await expect(validateUploadedPhoto(input)).rejects.toThrow();
  await expect(
    validatePhotoAsset({ ...photo, mediaType: "image/jpeg" }),
  ).rejects.toThrow();
});
