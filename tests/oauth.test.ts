import { it, expect, vi, afterEach, beforeEach } from "vitest";
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
const controls = vi.hoisted(() => ({
  registerFlow: vi.fn(),
  consumeFlow: vi.fn(),
}));
vi.mock("../lib/auth/security", () => ({
  securityStore: () => controls,
  clientAddress: () => "client",
}));
import { InvalidOAuthFlow, RateLimited } from "../lib/auth/security-store";
const consume = async () => undefined;
beforeEach(() => vi.resetAllMocks());
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
    consume,
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
      completeOAuth(config, params, cookie, request, time, consume),
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
      consume,
    ),
  ).rejects.toBeInstanceOf(AccessDenied);
  await expect(
    completeOAuth(
      config,
      a.params,
      a.cookie,
      vi.fn().mockRejectedValue(new Error("private-client-secret")),
      a.now,
      consume,
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
  const beginning = await start(
    new NextRequest(config.siteUrl + "/auth/github"),
  );
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
  expect(
    verifySession(session, config.secret, config.siteUrl, ["12345"])?.githubId,
  ).toBe("12345");
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

it("does not exchange codes after flow consumption is rejected or rate limited", async () => {
  const a = flow(),
    request = api();
  await expect(
    completeOAuth(config, a.params, a.cookie, request, a.now, async () => {
      throw new InvalidOAuthFlow();
    }),
  ).rejects.toBeInstanceOf(OAuthFailure);
  await expect(
    completeOAuth(config, a.params, a.cookie, request, a.now, async () => {
      throw new RateLimited(60);
    }),
  ).rejects.toBeInstanceOf(RateLimited);
  expect(request).not.toHaveBeenCalled();
});
it("returns rate limits without issuing OAuth cookies or calling GitHub", async () => {
  env();
  controls.registerFlow.mockRejectedValue(new RateLimited(120));
  const result = await start(new NextRequest(config.siteUrl + "/auth/github"));
  expect(result.status).toBe(429);
  expect(result.headers.get("Retry-After")).toBe("120");
  expect(result.cookies.get(oauthCookie)).toBeUndefined();
  const a = flow(),
    request = api();
  vi.stubGlobal("fetch", request);
  controls.consumeFlow.mockRejectedValue(new RateLimited(60));
  const response = await callback(
    new NextRequest(config.siteUrl + "/auth/github/callback?" + a.params, {
      headers: { cookie: oauthCookie + "=" + a.cookie },
    }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(request).not.toHaveBeenCalled();
});
it("issues a signed session after OAuth without registering it in Git", async () => {
  env();
  const a = flow();
  vi.stubGlobal("fetch", api());
  const response = await callback(
    new NextRequest(config.siteUrl + "/auth/github/callback?" + a.params, {
      headers: { cookie: oauthCookie + "=" + a.cookie },
    }),
  );
  const token = response.cookies.get("skytte_session")?.value;
  expect(
    verifySession(token, config.secret, config.siteUrl, ["12345"])?.githubId,
  ).toBe("12345");
  expect(controls.consumeFlow).toHaveBeenCalledTimes(1);
  expect(Object.keys(controls)).toEqual(["registerFlow", "consumeFlow"]);
});

it("makes exactly one provider request when a saved flow is replayed after provider rejection", async () => {
  const { securityFixture } = await import("./security-fixture");
  const a = flow(),
    store = securityFixture(() => Math.floor(a.now / 1000));
  const exp = Math.floor(a.now / 1000) + oauthSeconds;
  await store.registerFlow(a.params.get("state")!, exp, "client");
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ error: "bad_verification_code" }, { status: 400 }),
    );
  for (let i = 0; i < 3; i++)
    await expect(
      completeOAuth(
        config,
        a.params,
        a.cookie,
        request,
        a.now,
        (state, expiry) => store.consumeFlow(state, expiry, "client"),
      ),
    ).rejects.toBeInstanceOf(OAuthFailure);
  expect(request).toHaveBeenCalledOnce();
});

it("sets secure production cookie flags and the absolute session lifetime", async () => {
  env();
  vi.stubEnv("NODE_ENV", "production");
  const a = flow();
  vi.stubGlobal("fetch", api());
  const response = await callback(
    new NextRequest(config.siteUrl + "/auth/github/callback?" + a.params, {
      headers: { cookie: oauthCookie + "=" + a.cookie },
    }),
  );
  expect(response.cookies.get("skytte_session")).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
});
