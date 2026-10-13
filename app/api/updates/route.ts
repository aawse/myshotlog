import { authenticated, AuthenticationRequired } from "@/lib/auth/server";
import { oauthConfig } from "@/lib/auth/github";
import {
  updateStatus,
  updateConfig,
  GitHubUpdates,
  UpdateError,
  clearUpdateCache,
} from "@/lib/updates/github";
import { limitUpdates, UpdateRateLimited } from "@/lib/updates/rate-limit";
import { boundedBody, BodyTooLarge } from "@/lib/request-body";
import { z } from "@/lib/validation";
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
  if (error instanceof BodyTooLarge)
    return response({ error: "invalidData" }, 413);
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return response({ error: "invalidData" }, 400);
  return response({ error: "unavailable" }, 503);
}
export async function GET() {
  try {
    const { user } = await authenticated();
    limitUpdates(user.id, false);
    return response(await updateStatus(user.githubId));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== oauthConfig().siteUrl)
      return response({ error: "forbidden" }, 403);
    const { user } = await authenticated();
    limitUpdates(user.id, true);
    const payload = z
      .object({ upstreamSha: z.string().regex(/^[a-f0-9]{40}$/) })
      .strict()
      .parse(JSON.parse(await boundedBody(request, 1024)));
    const config = updateConfig();
    if (!config) throw new UpdateError("configuration", 400);
    const result = await new GitHubUpdates(config).sync(
      user.githubId,
      payload.upstreamSha,
    );
    clearUpdateCache();
    return response(result);
  } catch (error) {
    if (
      error instanceof UpdateError &&
      ["changed", "conflict"].includes(error.code)
    )
      clearUpdateCache();
    return failure(error);
  }
}
