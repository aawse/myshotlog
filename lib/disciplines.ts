import { swText } from "./i18n";
import sources from "./rules/sources.json";
export const handbookUrl = sources.spsf.download;
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
    kind: "hits",
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
  {
    id: "ipsc-handgun",
    name: swText("discipline.ipsc-handgun"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-22",
    name: swText("discipline.ipsc-22"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-rifle",
    name: swText("discipline.ipsc-rifle"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-shotgun",
    name: swText("discipline.ipsc-shotgun"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-mini-rifle",
    name: swText("discipline.ipsc-mini-rifle"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-pcc",
    name: swText("discipline.ipsc-pcc"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-action-air",
    name: swText("discipline.ipsc-action-air"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-action-air-rifle",
    name: swText("discipline.ipsc-action-air-rifle"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-action-air-pcc",
    name: swText("discipline.ipsc-action-air-pcc"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "ipsc-combined",
    name: swText("discipline.ipsc-combined"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "nordic-steel",
    name: swText("discipline.nordic-steel"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "dmr",
    name: swText("discipline.dmr"),
    kind: "dynamic",
    section: swText("domain.separateRules"),
  },
  {
    id: "custom",
    name: swText("discipline.custom"),
    kind: "open",
    section: swText("domain.separateRules"),
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
