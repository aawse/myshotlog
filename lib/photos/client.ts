import { reusableJpeg, stripJpegMetadata } from "./jpeg";
import { swText } from "@/lib/i18n";
import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE, type PhotoDraft } from "./schema";
export async function prepareTargetPhoto(file: File): Promise<PhotoDraft> {
  if (file.size > 25_000_000 || !file.size)
    throw new Error(swText("photo.maxInput"));
  const dataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error(swText("photo.readFailed")));
      reader.readAsDataURL(blob);
    });
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(swText("photo.openFailed"));
    }
    if (
      file.size <= PHOTO_MAX_BYTES &&
      reusableJpeg(
        new Uint8Array(await file.arrayBuffer()),
        image.naturalWidth,
        image.naturalHeight,
      )
    ) {
      return { id: crypto.randomUUID(), data: await dataUrl(file) };
    }
    const canvas = document.createElement("canvas");
    for (const edge of [PHOTO_MAX_EDGE, 1280, 1024, 800]) {
      const scale = Math.min(
        1,
        edge / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { colorSpace: "srgb" });
      if (!context) throw new Error(swText("photo.processingUnavailable"));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) =>
              result
                ? resolve(result)
                : reject(new Error(swText("photo.compressFailed"))),
            "image/jpeg",
            quality,
          );
        });
        if (blob.type !== "image/jpeg")
          throw new Error(swText("photo.jpegUnavailable"));
        const clean = new Blob(
          [stripJpegMetadata(new Uint8Array(await blob.arrayBuffer()))],
          { type: "image/jpeg" },
        );
        if (clean.size <= PHOTO_MAX_BYTES) {
          const data = await dataUrl(clean);
          return { id: crypto.randomUUID(), data };
        }
      }
    }
    throw new Error(swText("photo.tooLarge"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
