import { swText, t, type Language } from "@/lib/i18n";
import { z } from "./validation";
import { witnessSchema } from "./witness/model";
import { photoAssetSchema } from "./photos/schema";
import {
  seriesConditions,
  firearmSchema,
  sessionSchema,
  profileSchema,
  quickEntrySchema,
  type Records,
  profileBirthYear,
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
const legacyExportSchema = z
  .object({
    format: z.literal("skytte"),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    profile: profileSchema,
    firearms: z.array(firearmSchema).max(1000),
    sessions: z.array(sessionSchema).max(10000),
    assessments: z.array(assessmentSchema).max(100000),
    quickEntries: z.array(quickEntrySchema).max(10000).default([]),
    photos: z.array(photoAssetSchema).max(10000).default([]),
  })
  .strict()
  .superRefine((d, c) => {
    if (
      new Set(d.photos.map((p) => p.id)).size !== d.photos.length ||
      new Set(d.quickEntries.map((q) => q.id)).size !== d.quickEntries.length ||
      new Set(d.firearms.map((f) => f.id)).size !== d.firearms.length ||
      new Set(d.sessions.map((s) => s.id)).size !== d.sessions.length ||
      new Set(d.assessments.map((a) => a.id)).size !== d.assessments.length
    )
      c.addIssue({ code: "custom", message: swText("import.duplicates") });
    const attached = new Set(
      d.sessions.flatMap((s) => s.results.map((r) => r.id)),
    );
    if (d.quickEntries.some((q) => attached.has(q.id)))
      c.addIssue({ code: "custom", message: swText("import.attachedQuick") });
    const ids = new Set(d.photos.map((p) => p.id));
    for (const r of [
      ...d.sessions.flatMap((s) => s.results),
      ...d.quickEntries.map((q) => q.result),
    ])
      if (r.photoId && !ids.has(r.photoId))
        c.addIssue({
          code: "custom",
          message: swText("import.photoMissing"),
        });
    const firearms = new Set(d.firearms.map((f) => f.id));
    for (const s of d.sessions)
      if (s.firearmId && !firearms.has(s.firearmId))
        c.addIssue({
          code: "custom",
          message: swText("import.firearmMissing"),
        });
    const sessions = new Map(
      d.sessions.map((s) => [
        s.id,
        { revision: s.revision, results: new Set(s.results.map((r) => r.id)) },
      ]),
    );
    for (const a of d.assessments) {
      const session = sessions.get(a.sessionId);
      if (
        !session ||
        a.revision > session.revision ||
        (a.revision === session.revision && !session.results.has(a.resultId))
      )
        c.addIssue({ code: "custom", message: swText("import.resultMissing") });
    }
  });
// Birth information is raw recording context, not a rule conclusion.
const recordingContextSchema = z
  .object({
    id: z.string(),
    sessionId: z.uuid(),
    resultId: z.uuid(),
    birthDate: z.string().nullable(),
    birthYear: z.number().int().nullable(),
  })
  .strict()
  .superRefine((context, c) => {
    if (
      context.id !== context.sessionId + ":" + context.resultId ||
      !profileSchema.safeParse({
        displayName: "",
        timezone: "Europe/Stockholm",
        birthDate: context.birthDate,
        birthYear: context.birthYear,
      }).success
    )
      c.addIssue({ code: "custom", message: swText("import.resultMissing") });
  });
export type RecordingContext = z.infer<typeof recordingContextSchema>;
export function recordingContexts(records: Records): RecordingContext[] {
  const inputs = new Map<string, unknown>();
  for (const assessment of records.assessments) {
    const key = assessment.sessionId + ":" + assessment.resultId;
    if (!inputs.has(key)) inputs.set(key, assessment.input);
  }
  return records.sessions.flatMap((session) =>
    session.results.map((result) => {
      const input = inputs.get(session.id + ":" + result.id);
      const captured =
        input && typeof input === "object" && Object.hasOwn(input, "birthYear")
          ? profileSchema.safeParse({
              ...records.profile,
              birthDate: (input as { birthDate?: unknown }).birthDate ?? null,
              birthYear: (input as { birthYear: unknown }).birthYear,
            })
          : null;
      const profile = captured?.success ? captured.data : records.profile;
      return {
        id: session.id + ":" + result.id,
        sessionId: session.id,
        resultId: result.id,
        birthDate: profile.birthDate ?? null,
        birthYear: profileBirthYear(profile),
      };
    }),
  );
}
export const exportSchema = z
  .object({
    format: z.literal("myshotlog"),
    version: z.literal(2),
    exportedAt: z.iso.datetime(),
    profile: profileSchema,
    firearms: z.array(firearmSchema).max(1000),
    sessions: z.array(sessionSchema).max(10000),
    recordingContexts: z.array(recordingContextSchema).max(100000),
    witnessSignoffs: z.array(witnessSchema).max(10000).default([]),
    quickEntries: z.array(quickEntrySchema).max(10000).default([]),
    photos: z.array(photoAssetSchema).max(10000).default([]),
  })
  .strict()
  .superRefine((data, c) => {
    const sessions = new Set(data.sessions.map((s) => s.id));
    const results = new Set(
      data.sessions.flatMap((s) => s.results.map((r) => s.id + ":" + r.id)),
    );
    if (
      new Set(data.witnessSignoffs.map((w) => w.id)).size !==
        data.witnessSignoffs.length ||
      data.witnessSignoffs.some((w) => !sessions.has(w.sessionId))
    )
      c.addIssue({ code: "custom", message: swText("import.duplicates") });
    // The legacy validator covers all shared references without retaining evaluations.
    const shared = legacyExportSchema.safeParse({
      format: "skytte",
      version: 1,
      exportedAt: data.exportedAt,
      profile: data.profile,
      firearms: data.firearms,
      sessions: data.sessions,
      quickEntries: data.quickEntries,
      photos: data.photos,
      assessments: [],
    });
    if (!shared.success)
      for (const issue of shared.error.issues)
        c.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
    if (
      new Set(data.recordingContexts.map((x) => x.id)).size !==
      data.recordingContexts.length
    )
      c.addIssue({ code: "custom", message: swText("import.duplicates") });
    if (
      data.recordingContexts.length !==
      data.sessions.reduce((count, s) => count + s.results.length, 0)
    )
      c.addIssue({ code: "custom", message: swText("import.resultMissing") });
    for (const context of data.recordingContexts)
      if (!results.has(context.id))
        c.addIssue({ code: "custom", message: swText("import.resultMissing") });
  });
export function exportRecords(
  records: Records,
  contexts = recordingContexts(records),
) {
  return {
    format: "myshotlog" as const,
    version: 2 as const,
    exportedAt: new Date().toISOString(),
    profile: records.profile,
    firearms: records.firearms,
    sessions: records.sessions,
    recordingContexts: contexts,
    quickEntries: records.quickEntries ?? [],
    photos: records.photos ?? [],
    witnessSignoffs: records.witnessSignoffs ?? [],
  };
}
export function parseImport(value: unknown) {
  // Read existing backups, but discard their conclusions and rule snapshots.
  if (
    value &&
    typeof value === "object" &&
    "format" in value &&
    value.format === "skytte"
  ) {
    const legacy = legacyExportSchema.parse(value);
    return exportSchema.parse(exportRecords(legacy));
  }
  return exportSchema.parse(value);
}
export function csv(sessions: Records["sessions"], language: Language = "sv") {
  const quote = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s.trimStart())) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      t(language, "common.date"),
      t(language, "session.sport"),
      t(language, "csv.program"),
      t(language, "sessions.groupPrefix"),
      t(language, "csv.location"),
      t(language, "common.seriesLabel"),
      t(language, "session.shots"),
      t(language, "session.points"),
      t(language, "session.hits"),
      t(language, "session.figures"),
      t(language, "csv.seconds"),
      t(language, "session.penaltyPoints"),
      t(language, "csv.penaltySeconds"),
      t(language, "session.elapsedSeconds"),
      t(language, "session.matchPercent"),
      t(language, "session.placement"),
      t(language, "session.scoreText"),
      t(language, "session.resultStatus"),
      t(language, "session.dryFire"),
      t(language, "session.stageDistance"),
      t(language, "event.unit"),
      t(language, "session.ruleReference"),
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
        String(r.elapsedSeconds ?? ""),
        String(r.matchPercent ?? ""),
        String(r.placement ?? ""),
        r.scoreText ?? "",
        r.status ?? "",
        r.dryFire ? "true" : "",
        String(r.stageDistance ?? ""),
        r.stageDistanceUnit ?? "",
        s.ruleReference ?? "",
      ]);
  return "\uFEFF" + rows.map((row) => row.map(quote).join(";")).join("\r\n");
}
