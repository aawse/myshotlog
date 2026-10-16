import { ImportTransfer } from "@/lib/import-transfer";
import { database, databasePrefix } from "@/lib/git-database/config";
import { photoIdSchema } from "@/lib/photos/schema";
import { swText } from "@/lib/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { journal } from "@/lib/data";
import { AuthenticationRequired, authenticated } from "@/lib/auth/server";
import {
  DatabaseConflict,
  DatabaseUnavailable,
} from "@/lib/git-database/types";
import { InvalidRecord, RecordNotFound } from "@/lib/git-database/store";
import { z } from "../../../lib/validation";
import { oauthConfig } from "@/lib/auth/github";
import { securityStore } from "@/lib/auth/security";
import { RateLimited } from "@/lib/auth/security-store";
import { boundedBody, BodyTooLarge } from "@/lib/request-body";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const response = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  if (error instanceof RateLimited) {
    const result = response({ error: error.message }, 429);
    result.headers.set("Retry-After", String(error.retryAfter));
    return result;
  }
  if (error instanceof BodyTooLarge)
    return response({ error: swText("api.tooLarge") }, 413);
  if (
    error instanceof AuthenticationRequired ||
    (error instanceof Error && error.message === "AUTH_REQUIRED")
  )
    return response({ error: swText("api.signIn") }, 401);
  if (error instanceof DatabaseConflict)
    return response({ error: error.message }, 409);
  if (error instanceof RecordNotFound)
    return response({ error: error.message }, 404);
  if (error instanceof InvalidRecord)
    return response({ error: error.message }, 400);
  if (error instanceof z.ZodError)
    return response(
      {
        error: swText("api.invalidData"),
      },
      400,
    );
  if (error instanceof SyntaxError)
    return response({ error: swText("api.invalidJson") }, 400);
  if (error instanceof DatabaseUnavailable)
    return response({ error: error.message }, 503);
  return response(
    {
      error: swText("api.storageFailure"),
    },
    503,
  );
}
export async function GET(request: NextRequest) {
  try {
    const { user } = await authenticated();
    await securityStore().limitApi(user.id, false);
    const { photo } = z
      .object({ photo: photoIdSchema })
      .strict()
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    return response(await (await journal()).photo(photo));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    // Next.js can reconstruct request.url using an internal hostname without Proxy.
    // Compare with the configured public origin, never a client-controlled Host header.
    if (request.headers.get("origin") !== oauthConfig().siteUrl)
      return response({ error: swText("api.invalidOrigin") }, 403);
    const { user } = await authenticated();
    await securityStore().limitApi(user.id, true);
    const body = await boundedBody(request);
    const { action, payload, photos } = z
      .object({
        action: z.string(),
        payload: z.unknown(),
        photos: z.array(z.unknown()).max(10).optional(),
      })
      .strict()
      .parse(JSON.parse(body));
    if (["import-start", "import-chunk", "import-finish"].includes(action)) {
      if (photos) return response({ error: swText("api.invalidData") }, 400);
      const transfer = new ImportTransfer(
        database(),
        user.id,
        databasePrefix(),
        oauthConfig().secret,
      );
      if (action === "import-start" || action === "import-chunk")
        return response(await transfer.write(action, payload));
      const backup = await transfer.read(payload);
      return response(await (await journal()).mutate("import", backup));
    }
    const store = await journal();
    return response(
      await (photos
        ? store.mutate(action, payload, photos)
        : store.mutate(action, payload)),
    );
  } catch (error) {
    return failure(error);
  }
}
