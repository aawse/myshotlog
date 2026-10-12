import type { PhotoDraft } from "@/lib/photos/schema";
export async function mutate(
  action: string,
  payload: unknown,
  photos: PhotoDraft[] = [],
) {
  if (photos.length > 10)
    throw new Error(
      "Spara högst 10 nya foton åt gången. Spara passet och lägg sedan till fler.",
    );
  const response = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      payload,
      ...(photos.length ? { photos } : {}),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Åtgärden misslyckades");
  return data;
}
