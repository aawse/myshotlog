export function matchingLocations(locations: string[], query: string) {
  const unique = new Map<string, string>();
  for (const raw of locations) {
    const value = raw.trim();
    if (value && !unique.has(value.toLocaleLowerCase("sv-SE")))
      unique.set(value.toLocaleLowerCase("sv-SE"), value);
  }
  const needle = query.trim().toLocaleLowerCase("sv-SE");
  return [...unique.values()]
    .filter((value) => value.toLocaleLowerCase("sv-SE").includes(needle))
    .sort((a, b) => a.localeCompare(b, "sv-SE"))
    .slice(0, 10);
}
