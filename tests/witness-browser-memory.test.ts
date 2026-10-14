import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readWitnessMemory,
  writeWitnessMemory,
  witnessMemoryKey,
} from "../lib/witness/browser-memory";
const witness = {
  name: "Åsa Test",
  signature: {
    mediaType: "image/png" as const,
    width: 800,
    height: 300,
    data: "iVBORw0KGgoAAA==",
  },
};
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("round trips only the witness details, never invitation or confirmation data", () => {
  expect(readWitnessMemory()).toEqual({ remember: true, witness: null });
  writeWitnessMemory({
    ...witness,
    token: "secret",
    confirmed: true,
    results: [46],
  } as typeof witness);
  expect(readWitnessMemory()).toEqual({ remember: true, witness });
  expect(JSON.parse(values.get(witnessMemoryKey)!)).toEqual({
    version: 1,
    ...witness,
  });
});
it("forgets personal details and persists the opt-out", () => {
  writeWitnessMemory(witness);
  expect(writeWitnessMemory(null)).toBe(true);
  expect(readWitnessMemory()).toEqual({ remember: false, witness: null });
  expect(values.get(witnessMemoryKey)).toBe("off");
});
it.each([
  "invalid JSON",
  "null",
  "x".repeat(150001),
  JSON.stringify({ version: 2, ...witness }),
  JSON.stringify({ version: 1, ...witness, name: " " }),
  JSON.stringify({ version: 1, ...witness, name: "a".repeat(121) }),
  JSON.stringify({
    version: 1,
    ...witness,
    signature: { ...witness.signature, data: "javascript:alert(1)" },
  }),
  JSON.stringify({
    version: 1,
    ...witness,
    signature: { ...witness.signature, width: 1000 },
  }),
])("ignores invalid or unsupported storage (%#)", (raw) => {
  values.set(witnessMemoryKey, raw);
  expect(readWitnessMemory()).toEqual({ remember: true, witness: null });
});
it("handles unavailable storage without throwing", () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  });
  expect(readWitnessMemory().witness).toBeNull();
  expect(writeWitnessMemory(witness)).toBe(false);
});
it("removes the previous witness if replacing the cache fails", () => {
  writeWitnessMemory(witness);
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(writeWitnessMemory({ ...witness, name: "Another witness" })).toBe(
    false,
  );
  expect(values.has(witnessMemoryKey)).toBe(false);
});
