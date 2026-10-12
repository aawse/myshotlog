import { swText } from "../i18n";
import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from "./schema";
const metadata = new Set(["EXIF", "XMP ", "ICCP"]);
// https://developers.google.com/speed/webp/docs/riff_container
function chunks(data: Uint8Array) {
  const text = (offset: number) =>
    String.fromCharCode(...data.subarray(offset, offset + 4));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    data.length < 12 ||
    text(0) !== "RIFF" ||
    text(8) !== "WEBP" ||
    view.getUint32(4, true) + 8 !== data.length
  )
    return null;
  const result: { type: string; bytes: Uint8Array }[] = [];
  let offset = 12;
  while (offset < data.length) {
    if (offset + 8 > data.length) return null;
    const type = text(offset),
      size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > data.length || (type === "VP8X" && size !== 10)) return null;
    result.push({ type, bytes: data.subarray(offset, end) });
    offset = end;
  }
  return result;
}
// Reuse only complete, static WebP containers without embedded metadata.
export function reusableWebp(data: Uint8Array, width: number, height: number) {
  if (
    !data.length ||
    data.length > PHOTO_MAX_BYTES ||
    width < 1 ||
    height < 1 ||
    Math.max(width, height) > PHOTO_MAX_EDGE
  )
    return false;
  const parts = chunks(data);
  return (
    !!parts &&
    parts.some((p) => p.type === "VP8 " || p.type === "VP8L") &&
    parts.every(
      (p) =>
        !metadata.has(p.type) &&
        !["ANIM", "ANMF"].includes(p.type) &&
        (p.type !== "VP8X" || !(p.bytes[8] & 0x2e)),
    )
  );
}
// Chrome can add an ICC profile even to sRGB canvas output. Remove optional
// metadata without re-encoding pixels; keep RIFF length and VP8X flags correct.
export function stripWebpMetadata(data: Uint8Array) {
  const parts = chunks(data);
  if (
    !parts ||
    !parts.some((p) => p.type === "VP8 " || p.type === "VP8L") ||
    parts.some(
      (p) =>
        ["ANIM", "ANMF"].includes(p.type) ||
        (p.type === "VP8X" && p.bytes[8] & 2),
    )
  )
    throw new Error(swText("photo.compressFailed"));
  const kept = parts.filter((p) => !metadata.has(p.type));
  const result = new Uint8Array(
    12 + kept.reduce((sum, p) => sum + p.bytes.length, 0),
  );
  result.set(data.subarray(0, 12));
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  let offset = 12;
  for (const part of kept) {
    result.set(part.bytes, offset);
    if (part.type === "VP8X") result[offset + 8] &= ~0x2c;
    offset += part.bytes.length;
  }
  return result;
}
