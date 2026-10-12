import { z } from "zod";
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_MAX_BYTES = 180_000;
export const photoIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const photoDraftSchema = z
  .object({
    id: z.uuid(),
    data: z
      .string()
      .max(350_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type PhotoDraft = z.infer<typeof photoDraftSchema>;
export const photoAssetSchema = z
  .object({
    id: photoIdSchema,
    mediaType: z.literal("image/webp"),
    width: z.number().int().min(1).max(PHOTO_MAX_EDGE),
    height: z.number().int().min(1).max(PHOTO_MAX_EDGE),
    bytes: z.number().int().min(1).max(PHOTO_MAX_BYTES),
    data: z
      .string()
      .max(Math.ceil(PHOTO_MAX_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type PhotoAsset = z.infer<typeof photoAssetSchema>;
