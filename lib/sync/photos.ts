import {
  photoDraftSchema,
  PHOTO_MAX_BYTES,
  type PhotoDraft,
} from "../photos/schema";
export async function prepareQueuedPhotos(
  payload: unknown,
  photos: PhotoDraft[],
) {
  const replacements = new Map<string, string>(),
    cached: Record<string, string> = {};
  for (const input of photos) {
    const photo = photoDraftSchema.parse(input);
    const bytes = Uint8Array.from(atob(photo.data), (c) => c.charCodeAt(0));
    if (
      !bytes.length ||
      bytes.length > PHOTO_MAX_BYTES ||
      bytes[0] !== 255 ||
      bytes[1] !== 216
    )
      throw new Error("sync.invalidPhoto");
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    replacements.set(photo.id, hash);
    cached[hash] = "data:image/jpeg;base64," + photo.data;
  }
  const result = (value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const r = value as Record<string, unknown>;
    return {
      ...r,
      ...(typeof r.photoId === "string" && replacements.has(r.photoId)
        ? { photoId: replacements.get(r.photoId) }
        : {}),
    };
  };
  const session = (value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const s = value as Record<string, unknown>;
    return {
      ...s,
      ...(Array.isArray(s.results) ? { results: s.results.map(result) } : {}),
    };
  };
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    payload = Object.hasOwn(p, "result")
      ? { ...p, result: result(p.result) }
      : Object.hasOwn(p, "session")
        ? { ...p, session: session(p.session) }
        : session(p);
  }
  return { payload, cached };
}
