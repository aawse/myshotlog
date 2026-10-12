import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  seal,
  unseal,
  allowedUsers,
  legacyMapping,
  identitySchema,
  journalOwner,
} from "./session";
export const oauthCookie = "skytte_github_oauth";
export const oauthSeconds = 600;
export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  siteUrl: string;
  secret: string;
  allowed: string[];
  mapping: Record<string, string>;
};
export function oauthConfig(): OAuthConfig {
  const clientId = z.string().min(1).parse(process.env.GITHUB_CLIENT_ID),
    clientSecret = z.string().min(1).parse(process.env.GITHUB_CLIENT_SECRET),
    secret = z.string().min(32).parse(process.env.AUTH_SESSION_SECRET);
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (
    site.username ||
    site.password ||
    site.search ||
    site.hash ||
    site.pathname !== "/" ||
    !(
      site.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" &&
        site.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(site.hostname))
    )
  )
    throw new Error(
      "Configure an HTTPS site origin (HTTP localhost allowed in development)",
    );
  const allowed = allowedUsers(),
    mapping = legacyMapping();
  if (
    new Set(allowed.map((id) => journalOwner(id, mapping))).size !==
    allowed.length
  )
    throw new Error("GitHub users must have distinct journal owners");
  return {
    clientId,
    clientSecret,
    secret,
    siteUrl: site.origin,
    allowed,
    mapping,
  };
}
export function callbackUrl(config: OAuthConfig) {
  return config.siteUrl + "/auth/github/callback";
}
const flowSchema = z
  .object({
    purpose: z.literal("github-oauth"),
    state: z.string().length(43),
    verifier: z.string().length(43),
    exp: z.number().int(),
  })
  .strict();
export function beginOAuth(config: OAuthConfig, now = Date.now()) {
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(config),
    scope: "",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return {
    url: url.toString(),
    cookie: seal(
      {
        purpose: "github-oauth",
        state,
        verifier,
        exp: Math.floor(now / 1000) + oauthSeconds,
      },
      config.secret,
    ),
  };
}
export class OAuthFailure extends Error {
  constructor() {
    super("GitHub-inloggningen kunde inte genomföras. Försök igen.");
  }
}
export class AccessDenied extends Error {
  constructor() {
    super(
      "Ditt GitHub-konto har inte åtkomst till den här journalinstallationen. Kontakta instansägaren.",
    );
  }
}
export async function completeOAuth(
  config: OAuthConfig,
  params: URLSearchParams,
  cookie: string | undefined,
  request: typeof fetch = fetch,
  now = Date.now(),
) {
  const parsed = flowSchema.safeParse(unseal(cookie, config.secret)),
    state = params.get("state"),
    code = params.get("code");
  if (
    !parsed.success ||
    !state ||
    !code ||
    code.length > 512 ||
    params.has("error")
  )
    throw new OAuthFailure();
  const flow = parsed.data,
    actual = Buffer.from(state),
    expected = Buffer.from(flow.state);
  if (
    flow.exp <= Math.floor(now / 1000) ||
    flow.exp > Math.floor(now / 1000) + oauthSeconds ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new OAuthFailure();
  try {
    const tokenResponse = await request(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: callbackUrl(config),
          code_verifier: flow.verifier,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!tokenResponse.ok) throw new OAuthFailure();
    const token = z
      .object({
        access_token: z.string().min(1),
        token_type: z.literal("bearer"),
      })
      .parse(await tokenResponse.json());
    const userResponse = await request("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token.access_token,
        "X-GitHub-Api-Version": "2026-03-10",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!userResponse.ok) throw new OAuthFailure();
    const user = z
      .object({
        id: z.number().int().positive().safe(),
        login: z.string(),
        type: z.literal("User"),
      })
      .parse(await userResponse.json());
    const identity = identitySchema.parse({
      githubId: String(user.id),
      login: user.login,
    });
    if (!config.allowed.includes(identity.githubId)) throw new AccessDenied();
    return identity;
  } catch (error) {
    if (error instanceof AccessDenied) throw error;
    throw new OAuthFailure();
  }
  // The OAuth token is used only for identity lookup; never persisted or sent to the browser.
}
