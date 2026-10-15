import { createHash, randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { photoAssetSchema } from "../photos/schema";
import { z } from "../validation";
import { seal, unseal } from "../auth/session";
import { sessionSchema } from "../models";
import { t, type Language } from "../i18n";
import {
  DatabaseConflict,
  validPath,
  type GitDatabase,
  type GitSnapshot,
} from "../git-database/types";
import {
  reviewSession,
  reviewSchema,
  invitationSchema,
  witnessSchema,
  signatureSchema,
  type WitnessReview,
  type WitnessSignoff,
} from "./model";
export class WitnessUnavailable extends Error {}
export class WitnessSignatureInvalid extends Error {}
// Fingerprint signed invitations containing a 32-byte random nonce, or review JSON.
// These are token lookups/integrity digests, not user password hashes. Preserve
// their format so existing invitations and witnessed snapshots remain valid.
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const reviewDigest = (review: WitnessReview) =>
  hash(JSON.stringify(reviewSchema.parse(review)));
const claimSchema = z
  .object({
    purpose: z.literal("witness-v1"),
    aud: z.string(),
    ownerId: z.uuid(),
    githubId: z.string().regex(/^[1-9][0-9]*$/),
    prefix: z.string().max(160),
    id: z.uuid(),
    nonce: z.string().length(43),
    exp: z.number().int(),
  })
  .strict();
export function witnessClaims(
  token: string,
  secret: string,
  origin: string,
  now = Date.now(),
) {
  const parsed = claimSchema.safeParse(unseal(token, secret));
  if (
    !parsed.success ||
    parsed.data.aud !== origin ||
    parsed.data.exp <= now ||
    parsed.data.exp > now + 86400000
  )
    throw new WitnessUnavailable();
  validPath(parsed.data.prefix);
  return parsed.data;
}
async function decodeSignature(input: unknown) {
  const signature = signatureSchema.parse(input);
  const buffer = Buffer.from(signature.data, "base64");
  if (
    buffer.length > 100000 ||
    !buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new WitnessUnavailable();
  const image = sharp(buffer, { limitInputPixels: 240000, failOn: "warning" });
  const metadata = await image.metadata();
  if (
    metadata.format !== "png" ||
    (metadata.pages && metadata.pages !== 1) ||
    metadata.width !== signature.width ||
    metadata.height !== signature.height
  )
    throw new WitnessUnavailable();
  const { data, info } = await image
    .flatten({ background: "#fff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if ([...data].filter((value) => value < 200).length < 30)
    throw new WitnessUnavailable();
  // Re-encode validated pixels to discard metadata and trailing data, without temporary files.
  const clean = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (clean.length > 100000) throw new WitnessUnavailable();
  return signatureSchema.parse({
    ...signature,
    data: clean.toString("base64"),
  });
}
export async function validateSignature(input: unknown) {
  try {
    return await decodeSignature(input);
  } catch {
    throw new WitnessSignatureInvalid();
  }
}
export class WitnessStore {
  private path: string;
  constructor(
    private db: GitDatabase,
    private ownerId: string,
    private prefix: string,
    private secret: string,
    private origin: string,
    private githubId: string,
    private clock = () => Date.now(),
  ) {
    this.path = validPath(prefix) + "/users/" + z.uuid().parse(ownerId);
  }
  private invitationPath(id: string) {
    return this.path + "/witness-invitations/" + z.uuid().parse(id) + ".json";
  }
  private signoffPath(id: string) {
    return this.path + "/witness-signoffs/" + z.uuid().parse(id) + ".json";
  }
  private session(snapshot: GitSnapshot, id: string) {
    const content = snapshot.files.get(
      this.path + "/sessions/" + z.uuid().parse(id) + ".json",
    );
    if (!content) throw new WitnessUnavailable();
    return sessionSchema.parse(JSON.parse(content).entry);
  }
  private async change<T>(
    edit: (snapshot: GitSnapshot) => {
      value: T;
      changes: { path: string; content: string }[];
      message: string;
    },
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const snapshot = await this.db.snapshot(this.path);
      const result = edit(snapshot);
      try {
        await this.db.publish(snapshot, [
          { message: result.message, changes: result.changes },
        ]);
        return result.value;
      } catch (error) {
        if (!(error instanceof DatabaseConflict) || attempt === 4) throw error;
      }
    }
    throw new DatabaseConflict();
  }
  async create(sessionId: string, resultId: string | null) {
    const now = this.clock(),
      id = randomUUID(),
      exp = now + 86400000;
    const token = seal(
      {
        purpose: "witness-v1",
        aud: this.origin,
        ownerId: this.ownerId,
        githubId: this.githubId,
        prefix: this.prefix,
        id,
        nonce: randomBytes(32).toString("base64url"),
        exp,
      },
      this.secret,
    );
    return this.change((snapshot) => {
      const pending = [...snapshot.files].filter(
        ([path, content]) =>
          path.startsWith(this.path + "/witness-invitations/") &&
          JSON.parse(content).status === "pending" &&
          Date.parse(JSON.parse(content).expiresAt) > now,
      );
      if (pending.length >= 50) throw new WitnessUnavailable();
      const review = reviewSession(this.session(snapshot, sessionId), resultId);
      const invitation = invitationSchema.parse({
        version: 1,
        id,
        sessionId,
        resultId,
        tokenHash: hash(token),
        digest: reviewDigest(review),
        snapshot: review,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(exp).toISOString(),
        status: "pending",
      });
      return {
        value: { token, invitation },
        changes: [
          {
            path: this.invitationPath(id),
            content: JSON.stringify(invitation),
          },
        ],
        message: "MyShotLog: request witness sign-off " + id,
      };
    });
  }
  private grant(snapshot: GitSnapshot, token: string) {
    const claims = witnessClaims(token, this.secret, this.origin, this.clock());
    if (
      claims.ownerId !== this.ownerId ||
      claims.prefix !== this.prefix ||
      claims.githubId !== this.githubId
    )
      throw new WitnessUnavailable();
    const content = snapshot.files.get(this.invitationPath(claims.id));
    if (!content) throw new WitnessUnavailable();
    const grant = invitationSchema.parse(JSON.parse(content));
    if (
      grant.id !== claims.id ||
      grant.status !== "pending" ||
      grant.tokenHash !== hash(token) ||
      reviewDigest(grant.snapshot) !== grant.digest ||
      Date.parse(grant.expiresAt) !== claims.exp ||
      Date.parse(grant.expiresAt) <= this.clock() ||
      reviewDigest(
        reviewSession(this.session(snapshot, grant.sessionId), grant.resultId),
      ) !== grant.digest
    )
      throw new WitnessUnavailable();
    return grant;
  }
  async preview(token: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await this.db.snapshot(this.path);
      const grant = this.grant(snapshot, token);
      let photo: import("./model").WitnessPhoto | undefined;
      // Only an individual-series invitation grants access to its own target photo.
      const photoId = grant.resultId
        ? this.session(snapshot, grant.sessionId).results.find(
            (r) => r.id === grant.resultId,
          )?.photoId
        : undefined;
      if (photoId) {
        const path =
          this.prefix +
          "/photos/users/" +
          this.ownerId +
          "/" +
          photoId +
          "/image.json";
        const imageSnapshot = await this.db.snapshot(
          path.slice(0, -"/image.json".length),
        );
        // Never combine an authorized session snapshot with a newer repository state.
        if (imageSnapshot.head !== snapshot.head) continue;
        const content = imageSnapshot.files.get(path);
        if (content) {
          const asset = z
            .object({ version: z.literal(1), entry: photoAssetSchema })
            .strict()
            .parse(JSON.parse(content)).entry;
          if (asset.id !== photoId) throw new WitnessUnavailable();
          const { mediaType, width, height, data } = asset;
          photo = { mediaType, width, height, data };
        }
      }
      return {
        snapshot: grant.snapshot,
        expiresAt: grant.expiresAt,
        resultId: grant.resultId,
        ...(photo ? { photo } : {}),
      };
    }
    throw new DatabaseConflict();
  }
  async sign(
    token: string,
    name: string,
    language: Language,
    signature: unknown,
  ) {
    const clean = await validateSignature(signature);
    return this.change((snapshot) => {
      const grant = this.grant(snapshot, token);
      const entry = witnessSchema.parse({
        version: 1,
        id: grant.id,
        sessionId: grant.sessionId,
        resultId: grant.resultId,
        name,
        signedAt: new Date(this.clock()).toISOString(),
        statementVersion: 1,
        statementLanguage: language,
        statement: t(language, "witness.statement"),
        digest: grant.digest,
        snapshot: grant.snapshot,
        signature: clean,
      });
      return {
        value: { id: entry.id },
        message: "MyShotLog: witness sign-off " + entry.id,
        changes: [
          { path: this.signoffPath(entry.id), content: JSON.stringify(entry) },
          {
            path: this.invitationPath(grant.id),
            content: JSON.stringify({ ...grant, status: "signed" }),
          },
        ],
      };
    });
  }
  async cancel(id: string) {
    return this.change((snapshot) => {
      const content = snapshot.files.get(this.invitationPath(id));
      if (!content) throw new WitnessUnavailable();
      const grant = invitationSchema.parse(JSON.parse(content));
      if (grant.status !== "pending") throw new WitnessUnavailable();
      return {
        value: { ok: true },
        message: "MyShotLog: cancel witness invitation " + id,
        changes: [
          {
            path: this.invitationPath(id),
            content: JSON.stringify({ ...grant, status: "cancelled" }),
          },
        ],
      };
    });
  }
  async invitations(sessionId: string) {
    const snapshot = await this.db.snapshot(this.path + "/witness-invitations");
    return [...snapshot.files]
      .filter(([path]) => path.startsWith(this.path + "/witness-invitations/"))
      .map(([, content]) => invitationSchema.parse(JSON.parse(content)))
      .filter(
        (g) =>
          g.sessionId === sessionId &&
          g.status === "pending" &&
          Date.parse(g.expiresAt) > this.clock(),
      )
      .map(({ id, resultId, expiresAt }) => ({ id, resultId, expiresAt }));
  }
}
export async function validateSignoff(value: unknown): Promise<WitnessSignoff> {
  const entry = witnessSchema.parse(value);
  if (entry.digest !== reviewDigest(entry.snapshot))
    throw new WitnessUnavailable();
  return { ...entry, signature: await validateSignature(entry.signature) };
}
