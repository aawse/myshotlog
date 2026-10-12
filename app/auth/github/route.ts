import { NextResponse, type NextRequest } from "next/server";
import {
  beginOAuth,
  oauthConfig,
  oauthCookie,
  oauthSeconds,
} from "@/lib/auth/github";
import { securityStore, clientAddress } from "@/lib/auth/security";
import { RateLimited } from "@/lib/auth/security-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const flow = beginOAuth(oauthConfig());
    await securityStore().registerFlow(
      flow.state,
      flow.exp,
      clientAddress(request),
    );
    const response = NextResponse.redirect(flow.url);
    response.cookies.set(oauthCookie, flow.cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/github",
      maxAge: oauthSeconds,
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    if (error instanceof RateLimited)
      return new NextResponse(error.message, {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfter),
          "Cache-Control": "no-store",
        },
      });
    return new NextResponse(
      "Konfigurera GitHub-inloggning enligt installationsguiden.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
