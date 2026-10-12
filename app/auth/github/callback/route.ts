import { swText } from "@/lib/i18n";
import { NextResponse, type NextRequest } from "next/server";
import {
  completeOAuth,
  oauthConfig,
  oauthCookie,
  AccessDenied,
  type OAuthConfig,
} from "@/lib/auth/github";
import { signSession, sessionSeconds, sessionCookie } from "@/lib/auth/session";
import { securityStore, clientAddress } from "@/lib/auth/security";
import { RateLimited } from "@/lib/auth/security-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let config: OAuthConfig;
  try {
    config = oauthConfig();
  } catch {
    return new NextResponse(swText("auth.notConfigured"), {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  let response: NextResponse;
  try {
    const identity = await completeOAuth(
      config,
      request.nextUrl.searchParams,
      request.cookies.get(oauthCookie)?.value,
      fetch,
      Date.now(),
      (state, exp) =>
        securityStore().consumeFlow(state, exp, clientAddress(request)),
    );
    const now = Date.now(),
      token = signSession(identity, config.secret, config.siteUrl, now);
    response = NextResponse.redirect(config.siteUrl + "/dashboard");
    response.cookies.set(sessionCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionSeconds,
    });
  } catch (error) {
    response =
      error instanceof RateLimited
        ? new NextResponse(error.message, {
            status: 429,
            headers: { "Retry-After": String(error.retryAfter) },
          })
        : NextResponse.redirect(
            config.siteUrl +
              "/login?error=" +
              (error instanceof AccessDenied ? "access" : "oauth"),
          );
  }
  response.cookies.set(oauthCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/github",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
