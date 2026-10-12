export const sessionCookie = "myshotlog_session";
import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "../validation";
export const githubIdSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .max(20);
export const identitySchema = z
  .object({
    githubId: githubIdSchema,
    login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/),
  })
  .strict();
export type Identity = z.infer<typeof identitySchema>;
export const sessionSeconds = 8 * 60 * 60;
export function allowedUsers(
  value = process.env.GITHUB_ALLOWED_USER_IDS ?? "",
) {
  const ids = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => githubIdSchema.parse(id));
  if (!ids.length || new Set(ids).size !== ids.length)
    throw new Error("Configure unique allowed GitHub user IDs");
  return ids;
}
export function legacyMapping(value = process.env.GITHUB_USER_ID_MAP ?? "{}") {
  const mapping = z.record(githubIdSchema, z.uuid()).parse(JSON.parse(value));
  if (new Set(Object.values(mapping)).size !== Object.keys(mapping).length)
    throw new Error("Duplicate journal owner mapping");
  return mapping;
}
// Keep the original namespace: changing it would orphan existing journals.
const journalIdentityNamespace = "skytte:github.com:user:";
// Names and email addresses can change. Only the verified immutable numeric ID selects a journal.
export function journalOwner(
  githubId: string,
  mapping: Record<string, string> = {},
) {
  githubIdSchema.parse(githubId);
  if (mapping[githubId]) return z.uuid().parse(mapping[githubId]);
  const hash = createHash("sha256")
    .update(journalIdentityNamespace + githubId)
    .digest();
  hash[6] = (hash[6] & 15) | 128;
  hash[8] = (hash[8] & 63) | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function signature(payload: string, secret: string) {
  if (Buffer.byteLength(secret) < 32)
    throw new Error("Session secret requires 32 bytes");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
export function seal(value: unknown, secret: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return payload + "." + signature(payload, secret);
}
export function unseal(value: string | undefined, secret: string): unknown {
  if (!value || value.length > 4096) return null;
  try {
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const expected = Buffer.from(signature(parts[0], secret)),
      actual = Buffer.from(parts[1]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return null;
    return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
const tokenSchema = identitySchema
  .extend({
    purpose: z.literal("github-cookie-session-v2"),
    aud: z.url(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int(),
    sid: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export function signSession(
  identity: Identity,
  secret: string,
  origin: string,
  now = Date.now(),
) {
  if (new URL(origin).origin !== origin)
    throw new Error("Session audience must be a site origin");
  return seal(
    {
      ...identitySchema.parse(identity),
      purpose: "github-cookie-session-v2",
      aud: origin,
      iat: Math.floor(now / 1000),
      sid: randomBytes(32).toString("base64url"),
      exp: Math.floor(now / 1000) + sessionSeconds,
    },
    secret,
  );
}
export function verifySession(
  value: string | undefined,
  secret: string,
  origin: string,
  allowed: string[],
  mapping: Record<string, string> = {},
  now = Date.now(),
) {
  const parsed = tokenSchema.safeParse(unseal(value, secret));
  if (!parsed.success) return null;
  const token = parsed.data;
  if (
    token.aud !== origin ||
    token.iat > Math.floor(now / 1000) + 30 ||
    token.exp <= Math.floor(now / 1000) ||
    token.exp <= token.iat ||
    token.exp - token.iat > sessionSeconds ||
    !allowed.includes(token.githubId)
  )
    return null;
  return {
    id: journalOwner(token.githubId, mapping),
    githubId: token.githubId,
    login: token.login,
  };
}
