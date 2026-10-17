import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  pbkdf2Sync,
} from "node:crypto";
import { z } from "./validation";
import { InvalidRecord } from "./git-database/store";
import {
  DatabaseConflict,
  validPath,
  type GitDatabase,
  type GitChange,
} from "./git-database/types";
import { swText } from "./i18n";
import {
  TRANSFER_CHUNK_BYTES,
  TRANSFER_MAX_BYTES,
  TRANSFER_TTL_MS,
} from "./transfer-limits";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const startSchema = z
  .object({
    id: z.uuid(),
    bytes: z.number().int().min(1).max(TRANSFER_MAX_BYTES),
    hash: digest,
  })
  .strict();
const manifestSchema = startSchema.extend({
  expires: z.number().int(),
  received: z
    .number()
    .int()
    .min(0)
    .max(Math.ceil(TRANSFER_MAX_BYTES / TRANSFER_CHUNK_BYTES)),
});
const chunkSchema = z
  .object({
    id: z.uuid(),
    index: z
      .number()
      .int()
      .min(0)
      .max(Math.ceil(TRANSFER_MAX_BYTES / TRANSFER_CHUNK_BYTES) - 1),
    data: z
      .string()
      .min(4)
      .max((TRANSFER_CHUNK_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
const idSchema = z.object({ id: z.uuid() }).strict();
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export class ImportTransfer {
  private path: string;
  private key: Buffer;
  constructor(
    private provider: GitDatabase,
    owner: string,
    prefix: string,
    secret: string,
    private now = () => Date.now(),
  ) {
    this.path = validPath(prefix) + "/imports/users/" + z.uuid().parse(owner);
    if (Buffer.byteLength(secret) < 32) throw new Error("Invalid transfer key");
    this.key = pbkdf2Sync(
      secret,
      "myshotlog-import-v2:" + this.path,
      600_000,
      32,
      "sha256",
    );
  }
  private invalid(): never {
    throw new InvalidRecord(swText("api.invalidData"));
  }
  private encrypt(bytes: Buffer, id: string, index: number) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`${this.path}:${id}:${index}`));
    const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return JSON.stringify({
      version: 2,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    });
  }
  private decrypt(content: string, id: string, index: number) {
    const value = z
      .object({
        version: z.literal(2),
        iv: z.string().max(24),
        tag: z.string().max(24),
        data: z.string().max((TRANSFER_CHUNK_BYTES / 3) * 4),
      })
      .strict()
      .parse(JSON.parse(content));
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(value.iv, "base64"),
    );
    cipher.setAAD(Buffer.from(`${this.path}:${id}:${index}`));
    cipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return Buffer.concat([
      cipher.update(Buffer.from(value.data, "base64")),
      cipher.final(),
    ]);
  }
  async write(action: "import-start" | "import-chunk", payload: unknown) {
    const start = action === "import-start" ? startSchema.parse(payload) : null;
    const chunk = action === "import-chunk" ? chunkSchema.parse(payload) : null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await this.provider.snapshot(this.path);
      const manifestPath = this.path + "/manifest.json";
      let changes: GitChange[];
      if (start) {
        changes = [...snapshot.files.keys()]
          .filter((path) => path !== manifestPath)
          .map((path) => ({ path, content: null }));
        changes.push({
          path: manifestPath,
          content: JSON.stringify({
            ...start,
            expires: this.now() + TRANSFER_TTL_MS,
            received: 0,
          }),
        });
      } else if (chunk) {
        const manifest = this.manifest(snapshot.files, chunk.id);
        const bytes = Buffer.from(chunk.data, "base64"),
          path = this.path + "/" + chunk.index + ".json";
        const expected = Math.min(
          TRANSFER_CHUNK_BYTES,
          manifest.bytes - chunk.index * TRANSFER_CHUNK_BYTES,
        );
        if (
          bytes.length !== expected ||
          bytes.toString("base64") !== chunk.data
        )
          this.invalid();
        if (chunk.index < manifest.received) {
          const previous = snapshot.files.get(path);
          if (
            !previous ||
            hash(this.decrypt(previous, chunk.id, chunk.index)) !== hash(bytes)
          )
            this.invalid();
          return { ok: true };
        }
        if (chunk.index !== manifest.received) this.invalid();
        changes = [
          { path, content: this.encrypt(bytes, chunk.id, chunk.index) },
          {
            path: manifestPath,
            content: JSON.stringify({
              ...manifest,
              received: manifest.received + 1,
            }),
          },
        ];
      } else return this.invalid();
      try {
        await this.provider.publish(snapshot, [
          { message: "MyShotLog: stage encrypted import", changes },
        ]);
        return { ok: true };
      } catch (error) {
        if (!(error instanceof DatabaseConflict) || attempt === 2) throw error;
      }
    }
    throw new DatabaseConflict();
  }
  private manifest(files: ReadonlyMap<string, string>, id: string) {
    const content = files.get(this.path + "/manifest.json");
    if (!content) return this.invalid();
    const manifest = manifestSchema.parse(JSON.parse(content));
    if (manifest.id !== id || manifest.expires <= this.now())
      return this.invalid();
    return manifest;
  }
  async read(payload: unknown): Promise<unknown> {
    const { id } = idSchema.parse(payload),
      snapshot = await this.provider.snapshot(this.path);
    const manifest = this.manifest(snapshot.files, id);
    if (manifest.received !== Math.ceil(manifest.bytes / TRANSFER_CHUNK_BYTES))
      return this.invalid();
    const chunks = [];
    for (let index = 0; index < manifest.received; index++) {
      const content = snapshot.files.get(this.path + "/" + index + ".json");
      if (!content) return this.invalid();
      chunks.push(this.decrypt(content, id, index));
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== manifest.bytes || hash(bytes) !== manifest.hash)
      return this.invalid();
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return this.invalid();
    }
    return JSON.parse(text);
  }
}
