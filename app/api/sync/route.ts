import { authenticated, AuthenticationRequired } from "@/lib/auth/server";
import { oauthConfig } from "@/lib/auth/github";
import { database, databasePrefix } from "@/lib/git-database/config";
import { journalPrefix } from "@/lib/git-database/journal-prefix";
import { GitJournalStore, InvalidRecord } from "@/lib/git-database/store";
import { DatabaseConflict } from "@/lib/git-database/types";
import { boundedBody, BodyTooLarge } from "@/lib/request-body";
import { limitUpdates, UpdateRateLimited } from "@/lib/updates/rate-limit";
import { browserScope, synchronize, SyncConflict } from "@/lib/sync/server";
import { batchSchema, headSchema } from "@/lib/sync/model";
import { z } from "@/lib/validation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const respond = (
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", ...extra },
  });
async function context() {
  const { user } = await authenticated();
  limitUpdates(user.id + ":sync");
  return { user, provider: database(), scope: browserScope(user.id) };
}
async function journalContext(value: Awaited<ReturnType<typeof context>>) {
  const { user, provider } = value;
  const prefix = await journalPrefix(
    provider,
    user.id,
    databasePrefix(),
    process.env.GIT_DATABASE_PREFIX !== undefined,
  );
  return {
    ...value,
    prefix,
    store: new GitJournalStore(provider, user.id, prefix),
  };
}
function failure(error: unknown) {
  if (error instanceof AuthenticationRequired)
    return respond({ error: "authentication" }, 401);
  if (error instanceof UpdateRateLimited)
    return respond({ error: "rateLimited" }, 429, {
      "Retry-After": String(error.retryAfter),
    });
  if (error instanceof BodyTooLarge) return respond({ error: "size" }, 413);
  if (
    error instanceof z.ZodError ||
    error instanceof SyntaxError ||
    error instanceof InvalidRecord
  )
    return respond({ error: "invalid" }, 400);
  if (error instanceof DatabaseConflict)
    return respond({ error: "retry" }, 409);
  return respond({ error: "unavailable" }, 503);
}
export async function GET(request: Request) {
  try {
    const value = await context();
    const { provider, scope } = value;
    const url = new URL(request.url);
    if (url.searchParams.get("scope") !== scope)
      return respond({ error: "scope" }, 403);
    const known = url.searchParams.get("head");
    if (known) headSchema.parse(known);
    if (
      known &&
      provider.currentHead &&
      (await provider.currentHead()) === known
    )
      return respond({ scope, head: known, unchanged: true });
    const { store } = await journalContext(value);
    const snapshot = await store.syncSnapshot();
    return respond({ scope, ...snapshot, unchanged: false });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== oauthConfig().siteUrl)
      return respond({ error: "origin" }, 403);
    const value = await context();
    const { scope } = value;
    const body = batchSchema.parse(JSON.parse(await boundedBody(request)));
    if (body.scope !== scope) return respond({ error: "scope" }, 403);
    const { user, provider, prefix, store } = await journalContext(value);
    try {
      return respond({
        scope,
        ...(await synchronize(provider, user.id, prefix, body.operations)),
      });
    } catch (error) {
      if (error instanceof SyncConflict)
        return respond(
          {
            scope,
            error: "conflict",
            conflict: { id: error.operation, current: error.current },
            ...(await store.syncSnapshot()),
          },
          409,
        );
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
