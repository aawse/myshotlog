import { authenticated, AuthenticationRequired } from "@/lib/auth/server";
import { oauthConfig } from "@/lib/auth/github";
import { securityStore } from "@/lib/auth/security";
import { RateLimited } from "@/lib/auth/security-store";
import { records } from "@/lib/data";
import { createSessionPdf } from "@/lib/pdf/session";
import { z } from "@/lib/validation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await authenticated();
    await securityStore().limitApi(user.id, false);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      return new Response(null, { status: 404, headers: privateHeaders });
    const data = await records();
    const session = data.sessions.find((s) => s.id === id);
    if (!session)
      return new Response(null, { status: 404, headers: privateHeaders });
    const url = new URL("/sessions/" + id + "/", oauthConfig().siteUrl).href;
    const bytes = await createSessionPdf(data, session, url);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="myshotlog-${session.date}-${session.id}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof RateLimited)
      return new Response(null, {
        status: 429,
        headers: { ...privateHeaders, "Retry-After": String(error.retryAfter) },
      });
    const unauthenticated =
      error instanceof AuthenticationRequired ||
      (error instanceof Error && error.message === "AUTH_REQUIRED");
    return new Response(null, {
      status: unauthenticated ? 401 : 503,
      headers: privateHeaders,
    });
  }
}
