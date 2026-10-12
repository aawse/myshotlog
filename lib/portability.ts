import { z } from "zod";
import {
  seriesConditions,
  firearmSchema,
  sessionSchema,
  profileSchema,
  quickEntrySchema,
  type Records,
} from "./models";
export const assessmentSchema = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid(),
    resultId: z.uuid(),
    revision: z.number().int().min(1),
    ruleVersion: z.string().max(120),
    status: z.enum(["not-applicable", "not-evaluated", "not-met", "met"]),
    level: z.enum(["bronze", "silver", "gold"]),
    reason: z.string().max(3000),
    source: z.string().max(2000),
    createdAt: z.iso.datetime(),
    input: z.unknown(),
  })
  .strict();
export const exportSchema = z
  .object({
    format: z.literal("skytte"),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    profile: profileSchema,
    firearms: z.array(firearmSchema).max(1000),
    sessions: z.array(sessionSchema).max(10000),
    assessments: z.array(assessmentSchema).max(100000),
    quickEntries: z.array(quickEntrySchema).max(10000).default([]),
  })
  .strict()
  .superRefine((d, c) => {
    if (
      new Set(d.quickEntries.map((q) => q.id)).size !== d.quickEntries.length ||
      new Set(d.firearms.map((f) => f.id)).size !== d.firearms.length ||
      new Set(d.sessions.map((s) => s.id)).size !== d.sessions.length ||
      new Set(d.assessments.map((a) => a.id)).size !== d.assessments.length
    )
      c.addIssue({ code: "custom", message: "Dubbla ID i import" });
    if (
      d.quickEntries.some((q) =>
        d.sessions.some((s) => s.results.some((r) => r.id === q.id)),
      )
    )
      c.addIssue({
        code: "custom",
        message: "En snabbserie är redan kopplad till ett pass",
      });
    for (const s of d.sessions)
      if (s.firearmId && !d.firearms.some((f) => f.id === s.firearmId))
        c.addIssue({ code: "custom", message: "Vapenreferens saknas" });
    for (const a of d.assessments)
      if (
        !d.sessions.some(
          (s) =>
            s.id === a.sessionId &&
            a.revision <= s.revision &&
            (a.revision < s.revision ||
              s.results.some((r) => r.id === a.resultId)),
        )
      )
        c.addIssue({ code: "custom", message: "Bedömning saknar resultat" });
  });
export function exportRecords(records: Records) {
  return {
    format: "skytte" as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    ...records,
  };
}
export function parseImport(value: unknown) {
  return exportSchema.parse(value);
}
export function csv(sessions: Records["sessions"]) {
  const quote = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s.trimStart())) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      "Datum",
      "Gren",
      "Program",
      "Vapengrupp",
      "Plats",
      "Serie",
      "Skott",
      "Poäng",
      "Träffar",
      "Figurer",
      "Sekunder",
      "Poängavdrag",
      "Straffsekunder",
    ],
  ];
  for (const s of sessions)
    for (const r of s.results)
      rows.push([
        s.date,
        s.discipline,
        s.program,
        s.group,
        s.location,
        r.label,
        String(r.shots),
        String(r.points ?? ""),
        String(r.hits ?? ""),
        String(r.figures ?? ""),
        String(seriesConditions(s, r).seconds ?? ""),
        String(r.penaltyPoints ?? ""),
        String(r.penaltySeconds ?? ""),
      ]);
  return "\uFEFF" + rows.map((row) => row.map(quote).join(";")).join("\r\n");
}
