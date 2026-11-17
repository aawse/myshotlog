import "server-only";

export function privateJson(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  // Next.js strips Content-Encoding from Route Handler responses and handles
  // transport compression when sending the body.
  return Response.json(value, {
    status,
    headers: { ...extra, "Cache-Control": "private, no-store" },
  });
}
