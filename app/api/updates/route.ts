import { authenticated, AuthenticationRequired } from "@/lib/auth/server";
import { updateStatus, UpdateError } from "@/lib/updates/github";
import { limitUpdates, UpdateRateLimited } from "@/lib/updates/rate-limit";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
function response(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", ...extra },
  });
}
function failure(error: unknown) {
  if (
    error instanceof AuthenticationRequired ||
    (error instanceof Error && error.message === "AUTH_REQUIRED")
  )
    return response({ error: "signIn" }, 401);
  if (error instanceof UpdateRateLimited)
    return response({ error: "rateLimited" }, 429, {
      "Retry-After": String(error.retryAfter),
    });
  if (error instanceof UpdateError)
    return response({ error: error.code }, error.status);
  return response({ error: "unavailable" }, 503);
}
export async function GET() {
  try {
    const { user } = await authenticated();
    limitUpdates(user.id);
    return response(await updateStatus());
  } catch (error) {
    return failure(error);
  }
}
