import { NextResponse, type NextRequest } from "next/server";
import { records, journal } from "@/lib/data";
import { AuthenticationRequired, authenticated } from "@/lib/auth/server";
import {
  DatabaseConflict,
  DatabaseUnavailable,
} from "@/lib/git-database/types";
import { InvalidRecord, RecordNotFound } from "@/lib/git-database/store";
import { exportRecords, csv } from "@/lib/portability";
import { z } from "../../../lib/validation";
import { oauthConfig } from "@/lib/auth/github";
import { securityStore } from "@/lib/auth/security";
import { RateLimited } from "@/lib/auth/security-store";
import { boundedBody, BodyTooLarge } from "@/lib/request-body";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
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
    return response({ error: "Filen är för stor (max 3 MB)." }, 413);
  if (
    error instanceof AuthenticationRequired ||
    (error instanceof Error && error.message === "AUTH_REQUIRED")
  )
    return response({ error: "Du måste logga in." }, 401);
  if (error instanceof DatabaseConflict)
    return response({ error: error.message }, 409);
  if (error instanceof RecordNotFound)
    return response({ error: error.message }, 404);
  if (error instanceof InvalidRecord)
    return response({ error: error.message }, 400);
  if (error instanceof z.ZodError)
    return response(
      {
        error:
          "Indata eller repository-data är ogiltiga. Kontrollera fälten och exportformatet.",
      },
      400,
    );
  if (error instanceof SyntaxError)
    return response({ error: "Ogiltig JSON." }, 400);
  if (error instanceof DatabaseUnavailable)
    return response({ error: error.message }, 503);
  return response(
    {
      error:
        "Git-journalen kunde inte läsas eller sparas. Kontrollera serverns anslutning.",
    },
    503,
  );
}
export async function GET(request: NextRequest) {
  try {
    const { user } = await authenticated();
    await securityStore().limitApi(user.id, false);
    const data = await records();
    const part = request.nextUrl.searchParams.get("part");
    if (part) {
      if (
        ![
          "profile",
          "firearms",
          "sessions",
          "assessments",
          "quickEntries",
          "photos",
        ].includes(part)
      )
        return response({ error: "Ogiltig exportdel." }, 400);
      if (part === "profile") return response(data.profile);
      if (part === "photos") data.photos = await (await journal()).photos();
      const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        return response({ error: "Ogiltig position." }, 400);
      return response(
        (
          data[
            part as
              | "firearms"
              | "sessions"
              | "assessments"
              | "quickEntries"
              | "photos"
          ] ?? []
        )
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(offset, offset + 10),
      );
    }
    const format = request.nextUrl.searchParams.get("format");
    if (format === "json") data.photos = await (await journal()).photos();
    if (format === "csv" || format === "json")
      return new NextResponse(
        format === "csv"
          ? csv(data.sessions)
          : JSON.stringify(exportRecords(data), null, 2),
        {
          headers: {
            "Content-Type":
              format === "csv" ? "text/csv; charset=utf-8" : "application/json",
            "Content-Disposition": `attachment; filename="${format === "csv" ? "MyShotLog.csv" : "MyShotLog-v1.json"}"`,
            "Cache-Control": "private, no-store",
          },
        },
      );
    return response(data);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    // Next.js can reconstruct request.url using an internal hostname without Proxy.
    // Compare with the configured public origin, never a client-controlled Host header.
    if (request.headers.get("origin") !== oauthConfig().siteUrl)
      return response({ error: "Ogiltigt ursprung." }, 403);
    const { user } = await authenticated();
    await securityStore().limitApi(user.id, true);
    const body = await boundedBody(request);
    const store = await journal();
    const { action, payload, photos } = z
      .object({
        action: z.string(),
        payload: z.unknown(),
        photos: z.array(z.unknown()).max(10).optional(),
      })
      .strict()
      .parse(JSON.parse(body));
    return response(
      await (photos
        ? store.mutate(action, payload, photos)
        : store.mutate(action, payload)),
    );
  } catch (error) {
    return failure(error);
  }
}
