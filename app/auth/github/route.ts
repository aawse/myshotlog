import { NextResponse } from "next/server";
import {
  beginOAuth,
  oauthConfig,
  oauthCookie,
  oauthSeconds,
} from "@/lib/auth/github";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const flow = beginOAuth(oauthConfig());
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
  } catch {
    return new NextResponse(
      "Konfigurera GitHub-inloggning enligt installationsguiden.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
