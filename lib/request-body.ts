export class BodyTooLarge extends Error {}
export const maxRecordBodyBytes = 3_000_000;
export async function boundedBody(
  request: Request,
  limit = maxRecordBodyBytes,
) {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    await request.body?.cancel().catch(() => undefined);
    throw new BodyTooLarge();
  }
  if (!request.body) return "";
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
