import type { WitnessSignoff } from "./model";

export const witnessMemoryKey = "myshotlog.witness.v1";
export type WitnessMemory = {
  name: string;
  signature: WitnessSignoff["signature"];
};

// Storage can be blocked by browser privacy settings. Signing must still work.
export function readWitnessMemory(): {
  remember: boolean;
  witness: WitnessMemory | null;
} {
  try {
    const raw = localStorage.getItem(witnessMemoryKey);
    if (raw === "off") return { remember: false, witness: null };
    if (!raw || raw.length > 150000) return { remember: true, witness: null };
    const value = JSON.parse(raw);
    const signature = value?.signature;
    if (
      value?.version === 1 &&
      typeof value.name === "string" &&
      value.name.trim().length > 0 &&
      value.name.length <= 120 &&
      signature?.mediaType === "image/png" &&
      signature.width === 800 &&
      signature.height === 300 &&
      typeof signature.data === "string" &&
      signature.data.length <= 140000 &&
      signature.data.startsWith("iVBORw0KGgo") &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(signature.data)
    )
      return {
        remember: true,
        witness: {
          name: value.name,
          signature: {
            mediaType: "image/png",
            width: 800,
            height: 300,
            data: signature.data,
          },
        },
      };
  } catch {
    /* Unavailable or invalid storage is treated as an empty cache. */
  }
  return { remember: true, witness: null };
}

export function writeWitnessMemory(witness: WitnessMemory | null): boolean {
  try {
    // Pick only these fields: never retain the invitation, results or confirmation.
    localStorage.setItem(
      witnessMemoryKey,
      witness
        ? JSON.stringify({
            version: 1,
            name: witness.name,
            signature: {
              mediaType: "image/png",
              width: 800,
              height: 300,
              data: witness.signature.data,
            },
          })
        : "off",
    );
    return true;
  } catch {
    // If a replacement failed (e.g. quota), avoid retaining a previous witness.
    try {
      localStorage.removeItem(witnessMemoryKey);
    } catch {
      /* Storage blocked. */
    }
    return false;
  }
}
