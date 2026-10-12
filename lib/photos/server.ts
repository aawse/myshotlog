import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_EDGE,
  photoAssetSchema,
  type PhotoAsset,
} from "./schema";
// Uploads are processed with buffers only. Do not retain photo operations between
// requests in libvips' process-wide cache or create upload files on the server.
sharp.cache(false);
export async function optimizeTargetPhoto(input: Buffer): Promise<PhotoAsset> {
  if (!input.length || input.length > 260_000)
    throw new Error("Bilden är för stor eller tom.");
  const image = sharp(input, {
    limitInputPixels: 40_000_000,
    animated: false,
    failOn: "error",
  });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "webp", "avif", "heif"].includes(metadata.format ?? "") ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("Välj ett stillbildsfoto.");
  for (const edge of [PHOTO_MAX_EDGE, 1280, 1024, 800]) {
    for (const quality of [80, 65, 50]) {
      const { data, info } = await image
        .clone()
        .rotate()
        .resize({
          width: edge,
          height: edge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= PHOTO_MAX_BYTES)
        return photoAssetSchema.parse({
          id: createHash("sha256").update(data).digest("hex"),
          mediaType: "image/webp",
          width: info.width,
          height: info.height,
          bytes: data.length,
          data: data.toString("base64"),
        });
    }
  }
  throw new Error("Bilden kunde inte komprimeras tillräckligt.");
}
export async function validatePhotoAsset(value: unknown): Promise<PhotoAsset> {
  const photo = photoAssetSchema.parse(value),
    data = Buffer.from(photo.data, "base64");
  if (
    data.length !== photo.bytes ||
    data.toString("base64") !== photo.data ||
    createHash("sha256").update(data).digest("hex") !== photo.id
  )
    throw new Error("Ogiltig bilddata.");
  const metadata = await sharp(data, {
    limitInputPixels: PHOTO_MAX_EDGE ** 2,
    failOn: "error",
  }).metadata();
  if (
    metadata.format !== "webp" ||
    metadata.width !== photo.width ||
    metadata.height !== photo.height ||
    (metadata.pages ?? 1) !== 1 ||
    metadata.exif ||
    metadata.xmp ||
    metadata.icc
  )
    throw new Error("Ogiltigt eller ooptimerat foto.");
  // Decode too, so truncated files cannot be committed via backup import.
  await sharp(data, {
    limitInputPixels: PHOTO_MAX_EDGE ** 2,
    failOn: "error",
  }).stats();
  return photo;
}
