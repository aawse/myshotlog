import { limitUpdates } from "@/lib/updates/rate-limit";
import { z } from "@/lib/validation";
import { authenticated, AuthenticationRequired } from "@/lib/auth/server";
import { oauthConfig } from "@/lib/auth/github";
import { securityStore, clientAddress } from "@/lib/auth/security";
import { RateLimited } from "@/lib/auth/security-store";
import { boundedBody, BodyTooLarge } from "@/lib/request-body";
import { ownerWitnessStore, anonymousWitnessStore } from "@/lib/witness/server";
import {
  WitnessUnavailable,
  WitnessSignatureInvalid,
} from "@/lib/witness/store";
import { signatureSchema } from "@/lib/witness/model";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const token = z.string().min(1).max(4096);
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      sessionId: z.uuid(),
      resultId: z.uuid().nullable(),
    })
    .strict(),
  z.object({ action: z.literal("cancel"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("preview"), token }).strict(),
  z
    .object({
      action: z.literal("sign"),
      token,
      name: z.string().trim().min(1).max(120),
      language: z.enum(["sv", "en"]),
      confirmed: z.literal(true),
      signature: signatureSchema,
    })
    .strict(),
]);
const respond = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
export async function POST(request: Request) {
  try {
    const config = oauthConfig();
    if (request.headers.get("origin") !== config.siteUrl)
      return respond({ error: "origin" }, 403);
    const body = input.parse(JSON.parse(await boundedBody(request, 160000)));
    if (body.action === "create" || body.action === "cancel") {
      const { user } = await authenticated();
      await securityStore().limitApi(user.id, true);
      const store = await ownerWitnessStore(user);
      if (body.action === "cancel") return respond(await store.cancel(body.id));
      const { token, invitation } = await store.create(
        body.sessionId,
        body.resultId,
      );
      return respond({
        url: config.siteUrl + "/witness/#" + new URLSearchParams({ token }),
        invitation: {
          id: invitation.id,
          resultId: invitation.resultId,
          expiresAt: invitation.expiresAt,
        },
      });
    }
    const store = anonymousWitnessStore(body.token);
    await securityStore().limitWitness(clientAddress(request));
    if (body.action === "preview")
      return respond(await store.preview(body.token));
    return respond(
      await store.sign(body.token, body.name, body.language, body.signature),
    );
  } catch (error) {
    if (error instanceof WitnessSignatureInvalid)
      return respond({ error: "signature" }, 400);
    if (error instanceof WitnessUnavailable)
      return respond({ error: "unavailable" }, 410);
    if (error instanceof AuthenticationRequired)
      return respond({ error: "authentication" }, 401);
    if (error instanceof RateLimited) {
      const result = respond({ error: "rate" }, 429);
      result.headers.set("Retry-After", String(error.retryAfter));
      return result;
    }
    if (error instanceof BodyTooLarge) return respond({ error: "size" }, 413);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return respond({ error: "input" }, 400);
    return respond({ error: "storage" }, 503);
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await authenticated();
    limitUpdates(user.id + ":witness-read");
    const sessionId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("sessionId"));
    return respond({
      invitations: await (await ownerWitnessStore(user)).invitations(sessionId),
    });
  } catch (error) {
    return respond(
      {
        error:
          error instanceof AuthenticationRequired
            ? "authentication"
            : "unavailable",
      },
      error instanceof AuthenticationRequired ? 401 : 503,
    );
  }
}
