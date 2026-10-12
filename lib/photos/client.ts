import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE, type PhotoDraft } from "./schema";
export async function prepareTargetPhoto(file: File): Promise<PhotoDraft> {
  if (!file.type.startsWith("image/") || file.size > 25_000_000 || !file.size)
    throw new Error("Välj en bild på högst 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("Bilden kunde inte öppnas. Prova JPEG, PNG eller WebP.");
    }
    const canvas = document.createElement("canvas");
    for (const edge of [PHOTO_MAX_EDGE, 1280, 1024, 800]) {
      const scale = Math.min(
        1,
        edge / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Bildbehandling saknas i webbläsaren.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality),
          data = dataUrl.split(",")[1];
        if (Math.ceil((data.length * 3) / 4) <= PHOTO_MAX_BYTES)
          return { id: crypto.randomUUID(), data };
      }
    }
    throw new Error("Bilden kunde inte komprimeras tillräckligt.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
