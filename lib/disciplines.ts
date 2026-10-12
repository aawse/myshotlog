export const handbookUrl =
  "https://www.svenskappccupen.se/wp-content/uploads/2026/01/SHB_2026.pdf";
export const disciplines = [
  {
    id: "precision",
    name: "Precisionsskjutning",
    kind: "points",
    section: "F",
  },
  { id: "field", name: "Fältskjutning", kind: "field", section: "D" },
  {
    id: "magnum-field",
    name: "Magnumfältskjutning",
    kind: "field",
    section: "E",
  },
  {
    id: "magnum-precision",
    name: "Magnumprecision",
    kind: "points",
    section: "G",
  },
  { id: "rapid", name: "Snabbskjutning", kind: "points", section: "H" },
  { id: "military", name: "Militär snabbmatch", kind: "points", section: "J" },
  { id: "national", name: "Nationell helmatch", kind: "points", section: "I" },
  { id: "running", name: "Springskytte", kind: "time", section: "L" },
  { id: "ski", name: "Skidskytte", kind: "time", section: "K" },
  { id: "air", name: "Luftpistol", kind: "points", section: "M" },
  { id: "falling", name: "Falling target", kind: "time", section: "N" },
  { id: "ppc", name: "PPC", kind: "points", section: "O" },
  { id: "sra", name: "SRA", kind: "dynamic", section: "Separat regelverk" },
  {
    id: "application",
    name: "Tillämpningsserie (märkesprov)",
    kind: "hits",
    section: "Bilaga 1 §5.1.1.1",
  },
] as const;
export type DisciplineId = (typeof disciplines)[number]["id"];
export const disciplineIds = disciplines.map((d) => d.id) as [
  DisciplineId,
  ...DisciplineId[],
];
export function discipline(id: string) {
  return disciplines.find((d) => d.id === id)!;
}
export const weaponGroups = [
  "A",
  "A optisk",
  "B",
  "C",
  "R",
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M7",
  "M8",
  "M9",
  "Övrig / programspecifik",
] as const;
