import { swText } from "./i18n";
export const handbookUrl =
  "https://www.svenskappccupen.se/wp-content/uploads/2026/01/SHB_2026.pdf";
export const disciplines = [
  {
    id: "precision",
    name: swText("discipline.precision"),
    kind: "points",
    section: "F",
  },
  {
    id: "field",
    name: swText("discipline.field"),
    kind: "field",
    section: "D",
  },
  {
    id: "magnum-field",
    name: swText("discipline.magnum-field"),
    kind: "field",
    section: "E",
  },
  {
    id: "magnum-precision",
    name: swText("discipline.magnum-precision"),
    kind: "points",
    section: "G",
  },
  {
    id: "rapid",
    name: swText("discipline.rapid"),
    kind: "points",
    section: "H",
  },
  {
    id: "military",
    name: swText("discipline.military"),
    kind: "points",
    section: "J",
  },
  {
    id: "national",
    name: swText("discipline.national"),
    kind: "points",
    section: "I",
  },
  {
    id: "running",
    name: swText("discipline.running"),
    kind: "time",
    section: "L",
  },
  { id: "ski", name: swText("discipline.ski"), kind: "time", section: "K" },
  { id: "air", name: swText("discipline.air"), kind: "points", section: "M" },
  {
    id: "falling",
    name: swText("discipline.falling"),
    kind: "time",
    section: "N",
  },
  { id: "ppc", name: swText("discipline.ppc"), kind: "points", section: "O" },
  {
    id: "sra",
    name: swText("discipline.sra"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "application",
    name: swText("discipline.application"),
    kind: "hits",
    section: swText("domain.appendix"),
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
  swText("domain.optical"),
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
  swText("domain.otherGroup"),
] as const;
