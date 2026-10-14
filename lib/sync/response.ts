import "server-only";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
const compress = promisify(gzip);
export async function privateJson(
  request: Request,
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  const text = JSON.stringify(value);
  const accepts = (request.headers.get("accept-encoding") ?? "")
    .split(",")
    .some((value) => {
      const match = value.match(/^\s*gzip\s*(?:;\s*q=([0-9.]+))?\s*$/i);
      return match && Number(match[1] ?? 1) > 0;
    });
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Accept-Encoding",
    ...extra,
  };
  if (accepts && Buffer.byteLength(text) > 16384)
    return new Response(new Uint8Array(await compress(text)), {
      status,
      headers: { ...headers, "Content-Encoding": "gzip" },
    });
  return new Response(text, { status, headers });
}
