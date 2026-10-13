import { authenticated, AuthenticationRequired } from "@/lib/auth/server";
import { checkInstallation } from "@/lib/installation/check";
import { limitUpdates, UpdateRateLimited } from "@/lib/updates/rate-limit";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { user } = await authenticated();
    limitUpdates(user.id);
    return Response.json(
      await checkInstallation(user.githubId, new URL(request.url).origin),
      { headers },
    );
  } catch (error) {
    if (error instanceof AuthenticationRequired)
      return Response.json({ error: "signIn" }, { status: 401, headers });
    if (error instanceof UpdateRateLimited)
      return Response.json(
        { error: "rateLimited" },
        {
          status: 429,
          headers: { ...headers, "Retry-After": String(error.retryAfter) },
        },
      );
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
