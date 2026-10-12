import { swText } from "@/lib/i18n";
import type { PhotoDraft } from "@/lib/photos/schema";
export async function mutate(
  action: string,
  payload: unknown,
  photos: PhotoDraft[] = [],
) {
  if (photos.length > 10) throw new Error(swText("api.photoLimit"));
  const response = await fetch("/api/records/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      payload,
      ...(photos.length ? { photos } : {}),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? swText("api.failed"));
  return data;
}
