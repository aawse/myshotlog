import { it, expect } from "vitest";
import { matchingLocations } from "../lib/locations";
it("matches substrings regardless of case and deduplicates trimmed locations", () => {
  expect(
    matchingLocations(
      [" Högdalens bana ", "högdalens BANA", "Sätra", "Sätra pistolbana", ""],
      "BANA",
    ),
  ).toEqual(["Högdalens bana", "Sätra pistolbana"]);
});
it("allows new locations and limits only the matched suggestions", () => {
  expect(matchingLocations(["Sätra"], "new place")).toEqual([]);
  const values = Array.from({ length: 20 }, (_, i) => "Bana " + i);
  expect(matchingLocations(values, "")).toHaveLength(10);
  expect(matchingLocations(values, "19")).toEqual(["Bana 19"]);
});
