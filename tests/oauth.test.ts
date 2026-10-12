import { it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import {
  beginOAuth,
  completeOAuth,
  OAuthFailure,
  AccessDenied,
  oauthSeconds,
  oauthCookie,
  type OAuthConfig,
  oauthConfig,
} from "../lib/auth/github";
import { unseal, verifySession } from "../lib/auth/session";
import { GET as start } from "../app/auth/github/route";
import { GET as callback } from "../app/auth/github/callback/route";
const config: OAuthConfig = {
  clientId: "client",
  clientSecret: "private-client-secret",
  secret: "s".repeat(32),
  siteUrl: "https://skytte.example",
  allowed: ["12345"],
  mapping: {},
};
function flow() {
  const now = Date.now(),
    result = beginOAuth(config, now),
    url = new URL(result.url);
  return {
    ...result,
    now,
    url,
    params: new URLSearchParams({
      state: url.searchParams.get("state")!,
      code: "code",
    }),
  };
}
function api() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        access_token: "private-oauth-token",
        token_type: "bearer",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ id: 12345, login: "user", type: "User", email: null }),
    );
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("generates random state and S256 PKCE without requesting repository scopes", () => {
  const a = flow(),
    b = flow(),
    cookie = unseal(a.cookie, config.secret) as { verifier: string };
  expect(a.url.searchParams.get("state")).not.toBe(
    b.url.searchParams.get("state"),
  );
  expect(a.url.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(cookie.verifier).digest("base64url"),
  );
  expect(a.url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(a.url.searchParams.get("scope")).toBe("");
  expect(a.url.searchParams.get("redirect_uri")).toBe(
    config.siteUrl + "/auth/github/callback",
  );
});
it("verifies identity server-side and keeps OAuth tokens out of the identity", async () => {
  const a = flow(),
    request = api();
  const identity = await completeOAuth(
    config,
    a.params,
    a.cookie,
    request,
    a.now,
  );
  expect(identity).toEqual({ githubId: "12345", login: "user" });
  const options = request.mock.calls[0][1]!;
  expect(String(options.body)).toContain("code_verifier=");
  expect(String(options.body)).toContain("client_secret=private-client-secret");
  expect(request.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: "Bearer private-oauth-token",
  });
});
it("rejects missing, mismatched, tampered, expired or cancelled state before any network calls", async () => {
  const a = flow(),
    request = api();
  for (const [params, cookie, time] of [
    [a.params, undefined, a.now],
    [new URLSearchParams({ code: "code", state: "wrong" }), a.cookie, a.now],
    [a.params, a.cookie + "x", a.now],
    [a.params, a.cookie, a.now + oauthSeconds * 1000],
    [
      new URLSearchParams({
        code: "code",
        state: a.params.get("state")!,
        error: "access_denied",
      }),
      a.cookie,
      a.now,
    ],
  ] as const) {
    await expect(
      completeOAuth(config, params, cookie, request, time),
    ).rejects.toBeInstanceOf(OAuthFailure);
  }
  expect(request).not.toHaveBeenCalled();
});
it("denies unlisted GitHub accounts and sanitizes provider failures", async () => {
  const a = flow();
  await expect(
    completeOAuth(
      { ...config, allowed: ["999"] },
      a.params,
      a.cookie,
      api(),
      a.now,
    ),
  ).rejects.toBeInstanceOf(AccessDenied);
  await expect(
    completeOAuth(
      config,
      a.params,
      a.cookie,
      vi.fn().mockRejectedValue(new Error("private-client-secret")),
      a.now,
    ),
  ).rejects.toThrow("GitHub-inloggningen kunde inte genomföras");
});
function env() {
  vi.stubEnv("GITHUB_CLIENT_ID", config.clientId);
  vi.stubEnv("GITHUB_CLIENT_SECRET", config.clientSecret);
  vi.stubEnv("AUTH_SESSION_SECRET", config.secret);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", config.siteUrl);
  vi.stubEnv("GITHUB_ALLOWED_USER_IDS", "12345");
  vi.stubEnv("GITHUB_USER_ID_MAP", "{}");
}
it("sets secure HTTP-only cookies, consumes the flow cookie and redirects to a fixed origin", async () => {
  env();
  vi.stubEnv("NODE_ENV", "production");
  const beginning = await start();
  expect(beginning.status).toBe(307);
  expect(beginning.headers.get("set-cookie")).toContain("HttpOnly");
  expect(beginning.headers.get("set-cookie")).toContain("Secure");
  expect(beginning.headers.get("set-cookie")).toContain("SameSite=lax");
  const url = new URL(beginning.headers.get("location")!),
    cookie = beginning.cookies.get(oauthCookie)!.value;
  vi.stubGlobal("fetch", api());
  const response = await callback(
    new NextRequest(
      "https://spoof.example/auth/github/callback?code=code&state=" +
        url.searchParams.get("state"),
      { headers: { cookie: oauthCookie + "=" + cookie } },
    ),
  );
  expect(response.headers.get("location")).toBe(config.siteUrl + "/dashboard");
  expect(response.cookies.get(oauthCookie)?.value).toBe("");
  const session = response.cookies.get("skytte_session")!.value;
  expect(verifySession(session, config.secret, ["12345"])?.githubId).toBe(
    "12345",
  );
  expect(response.headers.get("set-cookie")).not.toContain(
    "private-oauth-token",
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not create a session on callback failure or reflect provider error text", async () => {
  env();
  const response = await callback(
    new NextRequest(
      config.siteUrl + "/auth/github/callback?error=private-secret",
    ),
  );
  expect(response.headers.get("location")).toBe(
    config.siteUrl + "/login?error=oauth",
  );
  expect(response.cookies.get("skytte_session")).toBeUndefined();
  expect(response.cookies.get(oauthCookie)?.value).toBe("");
});
it("rejects unsafe origins and empty access configuration", () => {
  env();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://user:password@skytte.example");
  expect(() => oauthConfig()).toThrow();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", config.siteUrl);
  vi.stubEnv("GITHUB_ALLOWED_USER_IDS", "");
  expect(() => oauthConfig()).toThrow();
});
