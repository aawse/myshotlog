import { swText } from "../i18n";
import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from "./schema";
// Preserve JPEG image/scanning bytes and JFIF, removing APP1–APP15 and comments.
// Scan entropy data separately: FF00 is escaped data; restart markers are kept.
export function stripJpegMetadata(data: Uint8Array) {
  const fail = () => {
    throw new Error(swText("photo.compressFailed"));
  };
  if (data.length < 4 || data[0] !== 255 || data[1] !== 216) return fail();
  const kept: Uint8Array[] = [data.subarray(0, 2)];
  let offset = 2,
    scanning = false,
    sawScan = false,
    ended = false;
  while (offset < data.length) {
    if (scanning) {
      const start = offset;
      while (offset < data.length) {
        if (data[offset] !== 255) {
          offset++;
          continue;
        }
        let next = offset + 1;
        while (data[next] === 255) next++;
        const marker = data[next];
        if (marker === 0 || (marker >= 208 && marker <= 215)) {
          offset = next + 1;
          continue;
        }
        break;
      }
      kept.push(data.subarray(start, offset));
      scanning = false;
    }
    const start = offset;
    if (data[offset++] !== 255) return fail();
    while (data[offset] === 255) offset++;
    const marker = data[offset++];
    if (marker === 217) {
      kept.push(data.subarray(start, offset));
      ended = offset === data.length;
      break;
    }
    if (marker === 216 || marker === 0 || marker === undefined) return fail();
    if (marker === 1 || (marker >= 208 && marker <= 215)) {
      kept.push(data.subarray(start, offset));
      continue;
    }
    if (offset + 2 > data.length) return fail();
    const length = data[offset] * 256 + data[offset + 1];
    if (length < 2 || offset + length > data.length) return fail();
    offset += length;
    if (!(marker >= 225 && marker <= 239) && marker !== 254)
      kept.push(data.subarray(start, offset));
    if (marker === 218) {
      scanning = true;
      sawScan = true;
    }
  }
  if (!ended || !sawScan) return fail();
  const result = new Uint8Array(kept.reduce((sum, p) => sum + p.length, 0));
  let position = 0;
  for (const part of kept) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}
export function reusableJpeg(data: Uint8Array, width: number, height: number) {
  if (
    !data.length ||
    data.length > PHOTO_MAX_BYTES ||
    width < 1 ||
    height < 1 ||
    Math.max(width, height) > PHOTO_MAX_EDGE
  )
    return false;
  try {
    return stripJpegMetadata(data).length === data.length;
  } catch {
    return false;
  }
}
