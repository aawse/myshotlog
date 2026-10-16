import { csv, exportRecords, parseImport } from "./portability";
import { photoAssetSchema } from "./photos/schema";
import type { Records } from "./models";
import { swText, type Language } from "./i18n";
import { z } from "./validation";
import { TRANSFER_CHUNK_BYTES, TRANSFER_MAX_BYTES } from "./transfer-limits";

async function transferRequest(
  request: typeof fetch,
  url: string,
  init: RequestInit,
) {
  for (let attempt = 0; ; attempt++) {
    const response = await request(url, init);
    if (response.status !== 429 || attempt === 2) return response;
    const delay = Number(response.headers.get("Retry-After"));
    if (!Number.isInteger(delay) || delay < 1 || delay > 60) return response;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
  }
}

export async function createBackup(
  records: Records,
  format: "json" | "csv",
  language: Language,
  request: typeof fetch = fetch,
) {
  if (format === "csv")
    return new Blob([csv(records.sessions, language)], {
      type: "text/csv;charset=utf-8",
    });
  const ids = [
    ...new Set(
      [
        ...records.sessions.flatMap((s) => s.results),
        ...(records.quickEntries ?? []).map((q) => q.result),
      ].flatMap((r) => (r.photoId ? [r.photoId] : [])),
    ),
  ];
  const photos = [];
  // Sequential reads avoid concurrent security-store commits and keep each response small.
  for (const id of ids) {
    const response = await transferRequest(
      request,
      `/api/records/?photo=${id}`,
      {
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(swText("profile.exportFailed"));
    const photo = photoAssetSchema.safeParse(await response.json());
    if (!photo.success || photo.data.id !== id)
      throw new Error(swText("profile.exportFailed"));
    photos.push(photo.data);
  }
  const blob = new Blob(
    [JSON.stringify(exportRecords({ ...records, photos }))],
    { type: "application/json" },
  );
  if (blob.size > TRANSFER_MAX_BYTES)
    throw new Error(swText("profile.fileTooLarge"));
  return blob;
}
export async function uploadBackup(
  value: unknown,
  request: typeof fetch = fetch,
) {
  // Fail before creating staging data; the server independently validates the full backup.
  const parsed = (() => {
    try {
      return parseImport(value);
    } catch {
      throw new Error(swText("profile.invalidJson"));
    }
  })();
  const bytes = new TextEncoder().encode(JSON.stringify(parsed));
  if (bytes.length > TRANSFER_MAX_BYTES)
    throw new Error(swText("profile.fileTooLarge"));
  const id = crypto.randomUUID();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest].map((n) => n.toString(16).padStart(2, "0")).join("");
  const send = async (action: string, payload: unknown) => {
    const response = await transferRequest(request, "/api/records/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!response.ok) {
      // Proxy/hosting errors need not be JSON; never display an upstream error body.
      throw new Error(swText("api.failed"));
    }
    return response.json();
  };
  await send("import-start", { id, bytes: bytes.length, hash });
  for (
    let offset = 0, index = 0;
    offset < bytes.length;
    offset += TRANSFER_CHUNK_BYTES, index++
  ) {
    const chunk = bytes.subarray(offset, offset + TRANSFER_CHUNK_BYTES);
    let binary = "";
    for (let i = 0; i < chunk.length; i += 8192)
      binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
    await send("import-chunk", { id, index, data: btoa(binary) });
  }
  return z
    .object({ imported: z.number().int().min(0) })
    .parse(await send("import-finish", { id }));
}
