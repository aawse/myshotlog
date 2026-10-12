import { swText } from "@/lib/i18n";
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
// Validate the browser's final WebP without changing a single uploaded byte.
export async function validateUploadedPhoto(
  input: Buffer,
): Promise<PhotoAsset> {
  if (!input.length || input.length > PHOTO_MAX_BYTES)
    throw new Error(swText("photo.emptyOrLarge"));
  const metadata = await sharp(input, {
    limitInputPixels: PHOTO_MAX_EDGE ** 2,
    failOn: "error",
  }).metadata();
  if (metadata.format !== "webp") throw new Error(swText("photo.requiresWebp"));
  return validatePhotoAsset({
    id: createHash("sha256").update(input).digest("hex"),
    mediaType: "image/webp",
    width: metadata.width,
    height: metadata.height,
    bytes: input.length,
    data: input.toString("base64"),
  });
}
export async function validatePhotoAsset(value: unknown): Promise<PhotoAsset> {
  const photo = photoAssetSchema.parse(value),
    data = Buffer.from(photo.data, "base64");
  if (
    data.length !== photo.bytes ||
    data.toString("base64") !== photo.data ||
    createHash("sha256").update(data).digest("hex") !== photo.id
  )
    throw new Error(swText("photo.invalidData"));
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
    throw new Error(swText("photo.invalidAsset"));
  // Decode too, so truncated files cannot be committed via backup import.
  await sharp(data, {
    limitInputPixels: PHOTO_MAX_EDGE ** 2,
    failOn: "error",
  }).stats();
  return photo;
}
