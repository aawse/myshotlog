import type { BrowserJournal } from "@/lib/sync/controller";
import type { Target } from "@/lib/sync/model";
let journal: BrowserJournal | undefined;
export function installJournal(value: BrowserJournal) {
  journal = value;
  return () => {
    if (journal === value) journal = undefined;
  };
}
export async function ensureSynchronized() {
  try {
    await journal?.ensureSynced();
  } catch (error) {
    throw translateError(error);
  }
}
export async function refreshJournal(clear = false) {
  await journal?.refresh(clear);
}
import { swText, messages, type MessageKey } from "@/lib/i18n";
import type { PhotoDraft } from "@/lib/photos/schema";
export async function mutate(
  action: string,
  payload: unknown,
  photos: PhotoDraft[] = [],
  expected: Target[] = [],
) {
  if (
    journal &&
    [
      "profile",
      "firearm",
      "session",
      "session-with-quick",
      "attach-quick",
      "quick-entry",
      "delete-session",
      "delete-quick-entry",
    ].includes(action)
  )
    return journal.enqueue(action, payload, photos, expected).catch((error) => {
      throw translateError(error);
    });
  await ensureSynchronized();
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
  await refreshJournal(action === "delete-records");
  return data;
}

function translateError(error: unknown) {
  const message = error instanceof Error ? error.message : "sync.failed";
  return new Error(
    Object.hasOwn(messages.sv, message)
      ? swText(message as MessageKey)
      : swText("sync.failed"),
  );
}
