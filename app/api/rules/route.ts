import { authenticated, AuthenticationRequired } from "@/lib/auth/server";
import { latestRules } from "@/lib/rules/latest";
import { limitUpdates, UpdateRateLimited } from "@/lib/updates/rate-limit";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { user } = await authenticated();
    limitUpdates(user.id + ":rules");
    return Response.json(await latestRules(), { headers });
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
