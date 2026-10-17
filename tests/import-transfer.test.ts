import { expect, it, vi } from "vitest";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { ImportTransfer } from "../lib/import-transfer";
import { DatabaseConflict, type GitDatabase } from "../lib/git-database/types";
import {
  TRANSFER_CHUNK_BYTES,
  TRANSFER_MAX_BYTES,
  TRANSFER_TTL_MS,
} from "../lib/transfer-limits";
const owner = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const id = "30000000-0000-4000-8000-000000000001";
const secret = "fictional-transfer-test-secret-at-least-32-bytes";
function fixture() {
  const files = new Map<string, string>();
  const provider: GitDatabase = {
    async snapshot(prefix) {
      return {
        head: null,
        files: new Map(
          [...files].filter(([path]) => path.startsWith(prefix + "/")),
        ),
      };
    },
    async publish(_snapshot, entries) {
      for (const entry of entries)
        expect(new Set(entry.changes.map((c) => c.path)).size).toBe(
          entry.changes.length,
        );
      for (const entry of entries)
        for (const change of entry.changes) {
          if (change.content === null) files.delete(change.path);
          else files.set(change.path, change.content);
        }
      return { head: null, commits: [] };
    },
  };
  let now = 1000;
  const transfer = new ImportTransfer(
    provider,
    owner,
    "test/v1",
    secret,
    () => now,
  );
  const bytes = Buffer.from(
    JSON.stringify({ fictional: "x".repeat(3_000_000), unicode: "åäö" }),
  );
  const start = {
    id,
    bytes: bytes.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
  const chunk = (index: number) => ({
    id,
    index,
    data: bytes
      .subarray(
        index * TRANSFER_CHUNK_BYTES,
        (index + 1) * TRANSFER_CHUNK_BYTES,
      )
      .toString("base64"),
  });
  const upload = async () => {
    await transfer.write("import-start", start);
    for (
      let index = 0;
      index < Math.ceil(bytes.length / TRANSFER_CHUNK_BYTES);
      index++
    )
      await transfer.write("import-chunk", chunk(index));
  };
  return {
    files,
    provider,
    transfer,
    bytes,
    start,
    chunk,
    upload,
    expire: () => {
      now += TRANSFER_TTL_MS;
    },
  };
}
it("reassembles more than 3 MB across server instances with no journal changes or plaintext staging", async () => {
  const f = fixture();
  await f.upload();
  const restarted = new ImportTransfer(
    f.provider,
    owner,
    "test/v1",
    secret,
    () => 2000,
  );
  expect(await restarted.read({ id })).toEqual(JSON.parse(f.bytes.toString()));
  expect(
    [...f.files.keys()].every((path) =>
      path.startsWith(`test/v1/imports/users/${owner}/`),
    ),
  ).toBe(true);
  expect([...f.files.values()].join("")).not.toContain("fictional");
});
it("rejects cross-owner access, owner injection, expired and replaced uploads", async () => {
  const f = fixture();
  await f.upload();
  const stranger = new ImportTransfer(f.provider, other, "test/v1", secret);
  await expect(stranger.read({ id })).rejects.toThrow();
  await expect(f.transfer.read({ id, owner })).rejects.toThrow();
  await expect(
    f.transfer.write("import-start", { ...f.start, owner }),
  ).rejects.toThrow();
  f.expire();
  await expect(f.transfer.read({ id })).rejects.toThrow();
  await expect(f.transfer.write("import-chunk", f.chunk(0))).rejects.toThrow();
  await f.transfer.write("import-start", { ...f.start, id: other });
  expect(f.files.size).toBe(1);
  await expect(f.transfer.read({ id })).rejects.toThrow();
});
it("rejects incomplete, reordered, wrong-size, invalid-base64 and oversized uploads", async () => {
  const f = fixture();
  await expect(
    f.transfer.write("import-start", {
      ...f.start,
      bytes: TRANSFER_MAX_BYTES + 1,
    }),
  ).rejects.toThrow();
  expect(f.files.size).toBe(0);
  await f.transfer.write("import-start", f.start);
  await expect(f.transfer.read({ id })).rejects.toThrow();
  await expect(f.transfer.write("import-chunk", f.chunk(1))).rejects.toThrow();
  await expect(
    f.transfer.write("import-chunk", { id, index: 0, data: "YQ==" }),
  ).rejects.toThrow();
  await expect(
    f.transfer.write("import-chunk", { id, index: 0, data: "!!!!" }),
  ).rejects.toThrow();
});
it("supports identical chunk retries and rejects conflicting retries", async () => {
  const f = fixture();
  await f.upload();
  await expect(f.transfer.write("import-chunk", f.chunk(0))).resolves.toEqual({
    ok: true,
  });
  await expect(
    f.transfer.write("import-chunk", {
      ...f.chunk(0),
      data: Buffer.alloc(TRANSFER_CHUNK_BYTES).toString("base64"),
    }),
  ).rejects.toThrow();
});
it("detects corrupt ciphertext and wrong complete-file hashes before journal mutation", async () => {
  const f = fixture();
  await f.upload();
  const path = `test/v1/imports/users/${owner}/0.json`;
  const content = JSON.parse(f.files.get(path) ?? "{}");
  f.files.set(
    path,
    JSON.stringify({ ...content, tag: Buffer.alloc(16).toString("base64") }),
  );
  await expect(f.transfer.read({ id })).rejects.toThrow();
  await f.transfer.write("import-start", { ...f.start, hash: "0".repeat(64) });
  for (let index = 0; index < 3; index++)
    await f.transfer.write("import-chunk", f.chunk(index));
  await expect(f.transfer.read({ id })).rejects.toThrow();
});
it("bounds conflict retries and propagates provider failures", async () => {
  const f = fixture();
  const publish = vi
    .spyOn(f.provider, "publish")
    .mockRejectedValue(new DatabaseConflict());
  await expect(f.transfer.write("import-start", f.start)).rejects.toThrow(
    DatabaseConflict,
  );
  expect(publish).toHaveBeenCalledTimes(3);
  publish.mockClear().mockRejectedValue(new Error("provider"));
  await expect(f.transfer.write("import-start", f.start)).rejects.toThrow(
    "provider",
  );
  expect(publish).toHaveBeenCalledTimes(1);
});

it("rejects non-UTF-8 and malformed JSON even when their complete-file hashes match", async () => {
  for (const bytes of [Buffer.from([0xff]), Buffer.from("{broken")]) {
    const f = fixture();
    await f.transfer.write("import-start", {
      ...f.start,
      bytes: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex"),
    });
    await f.transfer.write("import-chunk", {
      id,
      index: 0,
      data: bytes.toString("base64"),
    });
    await expect(f.transfer.read({ id })).rejects.toThrow();
  }
});

it("publishes a validated backup larger than 3 MB only after all parts arrive", async () => {
  const { exportRecords } = await import("../lib/portability");
  const { GitJournalStore } = await import("../lib/git-database/store");
  const { profile, firearm, session } = await import("./fixtures");
  const f = fixture();
  const backup = exportRecords({
    profile,
    firearms: [firearm],
    assessments: [],
    sessions: Array.from({ length: 700 }, (_, index) => ({
      ...session,
      id: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      notes: "x".repeat(4500),
    })),
  });
  const bytes = Buffer.from(JSON.stringify(backup));
  expect(bytes.length).toBeGreaterThan(3_000_000);
  await f.transfer.write("import-start", {
    id,
    bytes: bytes.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
  });
  for (
    let offset = 0, index = 0;
    offset < bytes.length;
    offset += TRANSFER_CHUNK_BYTES, index++
  ) {
    await f.transfer.write("import-chunk", {
      id,
      index,
      data: bytes
        .subarray(offset, offset + TRANSFER_CHUNK_BYTES)
        .toString("base64"),
    });
    expect(
      [...f.files.keys()].every((path) => path.includes("/imports/users/")),
    ).toBe(true);
  }
  const store = new GitJournalStore(f.provider, owner, "test/v1");
  const payload = await f.transfer.read({ id });
  expect((await store.mutate("import", payload)).imported).toBe(700);
  expect((await store.records()).sessions).toHaveLength(700);
  expect((await store.mutate("import", payload)).imported).toBe(0);
});

it("uses versioned PBKDF2 keys and rejects wrong secrets and unsupported versions", async () => {
  const f = fixture();
  await f.upload();
  const path = `test/v1/imports/users/${owner}/0.json`;
  const value = JSON.parse(f.files.get(path) ?? "{}");
  expect(value.version).toBe(2);
  const key = pbkdf2Sync(
    secret,
    `myshotlog-import-v2:test/v1/imports/users/${owner}`,
    600_000,
    32,
    "sha256",
  );
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64"),
  );
  cipher.setAAD(Buffer.from(`test/v1/imports/users/${owner}:${id}:0`));
  cipher.setAuthTag(Buffer.from(value.tag, "base64"));
  expect(
    Buffer.concat([
      cipher.update(Buffer.from(value.data, "base64")),
      cipher.final(),
    ]),
  ).toEqual(f.bytes.subarray(0, TRANSFER_CHUNK_BYTES));
  const wrong = new ImportTransfer(
    f.provider,
    owner,
    "test/v1",
    "another-fictional-secret-at-least-32-bytes",
    () => 2000,
  );
  await expect(wrong.read({ id })).rejects.toThrow();
  for (const version of [undefined, 1, 3]) {
    f.files.set(path, JSON.stringify({ ...value, version }));
    await expect(f.transfer.read({ id })).rejects.toThrow();
  }
});
