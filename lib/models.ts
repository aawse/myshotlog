import type { WitnessSignoff } from "./witness/model";
import { swText } from "@/lib/i18n";
import { z } from "./validation";
import { photoIdSchema, type PhotoAsset } from "./photos/schema";
import { discipline, disciplineIds } from "./disciplines";
const text = (max = 1000) => z.string().trim().max(max);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  }, swText("validation.date"));
const n = z.number().finite().nonnegative().max(1000000);
const integer = n.int();
export const resultSchema = z
  .object({
    id: z.uuid(),
    label: text(120),
    photoId: photoIdSchema.optional(),
    type: z.enum(["score", "application"]),
    shots: integer.max(1000),
    dryFire: z.boolean().optional(),
    stageDistance: n.optional(),
    stageDistanceUnit: z.enum(["m", "yd"]).optional(),
    stageTimeLimit: n.optional(),
    stageTarget: text(120).optional(),
    elapsedSeconds: n.optional(),
    matchPercent: n.max(100).optional(),
    placement: integer.min(1).optional(),
    scoreText: text(240).optional(),
    status: z.enum(["completed", "dnf", "dq", "dns"]).optional(),
    points: n.optional(),
    hits: integer.optional(),
    figures: integer.optional(),
    seconds: n.optional(),
    penaltyPoints: n.optional(),
    penaltySeconds: n.optional(),
    x: integer.optional(),
    distance: n.optional(),
    target: text(120).optional(),
    scoring: z.enum(["ordinary", "points"]).optional(),
    conditionsConfirmed: z.unknown().optional(),
    evidence: z.unknown().optional(),
  })
  .strict()
  .superRefine((r, c) => {
    if (r.shots === 0 && !r.dryFire && (!r.status || r.status === "completed"))
      c.addIssue({
        code: "custom",
        path: ["shots"],
        message: swText("validation.zeroShots"),
      });
    if (r.dryFire && r.shots !== 0)
      c.addIssue({
        code: "custom",
        path: ["shots"],
        message: swText("validation.dryShots"),
      });
    if (r.hits !== undefined && r.hits > r.shots)
      c.addIssue({
        code: "custom",
        message: swText("validation.hits"),
        path: ["hits"],
      });
    if (r.figures !== undefined && (r.hits === undefined || r.figures > r.hits))
      c.addIssue({
        code: "custom",
        message: swText("validation.figures"),
        path: ["figures"],
      });
    if (r.x !== undefined && r.x > r.shots)
      c.addIssue({
        code: "custom",
        message: swText("validation.innerTens"),
        path: ["x"],
      });
  });
export type Result = z.infer<typeof resultSchema>;
export const firearmSchema = z
  .object({
    id: z.uuid(),
    make: text(100).min(1),
    model: text(100).min(1),
    caliber: text(60).min(1),
    group: text(100).min(1),
    serial: text(150),
    nickname: text(100),
    notes: text(3000),
    archived: z.boolean(),
    defaultDiscipline: z.enum(disciplineIds).nullable().optional(),
    hasOptic: z.boolean().optional(),
    firearmType: z
      .enum(["pistol", "revolver", "rifle", "shotgun", "air", "other"])
      .optional(),
    classDefaults: z
      .partialRecord(z.enum(disciplineIds), text(100).min(1))
      .optional(),
  })
  .strict();
export type Firearm = z.infer<typeof firearmSchema>;
export const snapshotSchema = firearmSchema.omit({
  serial: true,
  notes: true,
  archived: true,
  defaultDiscipline: true,
});
export const sessionSchema = z
  .object({
    id: z.uuid(),
    date: dateSchema,
    time: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
    location: text(200),
    discipline: z.enum(disciplineIds),
    program: text(120).min(1),
    ruleReference: text(200).optional(),
    presetId: text(80).optional(),
    distance: n.nullable().optional(),
    seconds: n.nullable().optional(),
    target: text(120).nullable().optional(),
    firearmId: z.uuid().nullable(),
    firearmSnapshot: snapshotSchema.nullable(),
    group: text(100).min(1),
    context: z.enum(["practice", "competition"]),
    notes: text(5000),
    results: z.array(resultSchema).min(1).max(100),
    revision: z.number().int().min(1),
  })
  .strict()
  .superRefine((s, c) => {
    if (new Set(s.results.map((r) => r.id)).size !== s.results.length)
      c.addIssue({
        code: "custom",
        message: swText("validation.duplicateResults"),
      });
    for (const [i, r] of s.results.entries()) {
      const kind = discipline(s.discipline).kind;
      if (
        r.penaltyPoints !== undefined &&
        kind !== "dynamic" &&
        kind !== "open" &&
        (r.points === undefined || r.penaltyPoints > r.points)
      )
        c.addIssue({
          code: "custom",
          path: ["results", i, "penaltyPoints"],
          message: swText("validation.penalty"),
        });
      if (r.dryFire && s.discipline !== "custom")
        c.addIssue({
          code: "custom",
          path: ["results", i, "dryFire"],
          message: swText("validation.dryCustom"),
        });
      if (
        kind === "dynamic" &&
        s.discipline !== "sra" &&
        (!r.status || r.status === "completed")
      ) {
        if (r.points === undefined && r.hits === undefined)
          c.addIssue({
            code: "custom",
            path: ["results", i],
            message: swText("validation.score"),
          });
        if (!r.elapsedSeconds)
          c.addIssue({
            code: "custom",
            path: ["results", i, "elapsedSeconds"],
            message: swText("validation.elapsed"),
          });
      }
      if (
        [
          "precision",
          "magnum-precision",
          "rapid",
          "military",
          "national",
          "air",
          "ppc",
        ].includes(s.discipline) &&
        r.points === undefined
      )
        c.addIssue({
          code: "custom",
          message: swText("validation.points"),
          path: ["results", i, "points"],
        });
      if (
        [
          "field",
          "magnum-field",
          "running",
          "ski",
          "falling",
          "application",
        ].includes(s.discipline) &&
        r.hits === undefined
      )
        c.addIssue({
          code: "custom",
          message: swText("validation.requiredHits"),
          path: ["results", i, "hits"],
        });
      if (
        s.discipline === "precision" &&
        r.points !== undefined &&
        r.points > r.shots * 10
      )
        c.addIssue({
          code: "custom",
          message: swText("validation.maximumPoints"),
          path: ["results", i, "points"],
        });
      if (
        ["running", "ski", "sra"].includes(s.discipline) &&
        r.elapsedSeconds === undefined &&
        r.stageTimeLimit === undefined &&
        (s.seconds === null ||
          (s.seconds === undefined && r.seconds === undefined))
      )
        c.addIssue({
          code: "custom",
          message: swText("validation.time"),
          path:
            s.seconds !== undefined ? ["seconds"] : ["results", i, "seconds"],
        });
    }
  })
  .transform((s) => ({
    ...s,
    results: s.results.map((r) => {
      const copy = { ...r };
      delete copy.conditionsConfirmed;
      delete copy.evidence;
      if (s.distance !== undefined) delete copy.distance;
      if (s.target !== undefined) delete copy.target;
      if (s.seconds !== undefined) delete copy.seconds;
      return copy;
    }),
  }));
export type Session = z.infer<typeof sessionSchema>;
// Legacy series-specific conditions remain readable until replaced by a shared session value.
export function seriesConditions(session: Session, result: Result): Result {
  const effective = { ...result };
  if (session.distance !== undefined) {
    delete effective.distance;
    if (session.distance !== null) effective.distance = session.distance;
  }
  if (session.target !== undefined) {
    delete effective.target;
    if (session.target) effective.target = session.target;
  }
  if (session.seconds !== undefined) {
    delete effective.seconds;
    if (session.seconds !== null) effective.seconds = session.seconds;
  }
  if (result.stageDistance !== undefined)
    effective.distance =
      result.stageDistance * (result.stageDistanceUnit === "yd" ? 0.9144 : 1);
  if (result.stageTimeLimit !== undefined)
    effective.seconds = result.stageTimeLimit;
  if (result.stageTarget !== undefined) effective.target = result.stageTarget;
  return effective;
}
export function todayInTimezone(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const profileSchema = z
  .object({
    displayName: text(100),
    birthDate: dateSchema
      .refine((date) => date >= "1900-01-01", swText("validation.birthMinimum"))
      .nullable()
      .default(null),
    // Retained for version-1 exports and existing Git profile files.
    birthYear: z.number().int().min(1900).nullable().default(null),
    language: z.enum(["sv", "en"]).default("sv"),
    timezone: z
      .string()
      .max(100)
      .refine((s) => {
        try {
          new Intl.DateTimeFormat("sv", { timeZone: s });
          return true;
        } catch {
          return false;
        }
      }, swText("validation.timezone")),
  })
  .strict()
  .superRefine((p, ctx) => {
    let today: string;
    try {
      today = todayInTimezone(p.timezone);
    } catch {
      return;
    }
    if (p.birthDate && p.birthDate > today)
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: swText("validation.birthFuture"),
      });
    if (p.birthYear !== null && p.birthYear > Number(today.slice(0, 4)))
      ctx.addIssue({
        code: "custom",
        path: ["birthYear"],
        message: swText("validation.yearFuture"),
      });
    if (
      p.birthDate &&
      p.birthYear !== null &&
      Number(p.birthDate.slice(0, 4)) !== p.birthYear
    )
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: swText("validation.birthMismatch"),
      });
  })
  .transform((p) => ({
    ...p,
    birthYear: p.birthDate ? Number(p.birthDate.slice(0, 4)) : p.birthYear,
  }));
export type Profile = z.infer<typeof profileSchema>;
export function profileBirthYear(profile: Profile) {
  return profile.birthDate
    ? Number(profile.birthDate.slice(0, 4))
    : profile.birthYear;
}
export type Assessment = {
  id: string;
  sessionId: string;
  resultId: string;
  revision: number;
  ruleVersion: string;
  status: "not-applicable" | "not-evaluated" | "not-met" | "met";
  level: "bronze" | "silver" | "gold";
  reason: string;
  source: string;
  createdAt: string;
  input: unknown;
};
const quickFields = {
  presetId: text(80).optional(),
  id: z.uuid(),
  date: dateSchema,
  discipline: z.enum(disciplineIds),
  result: resultSchema,
  notes: text(1000),
};
function validateQuick(
  entry: { id: string; discipline: string; result: Result },
  ctx: z.RefinementCtx,
) {
  if (entry.id !== entry.result.id)
    ctx.addIssue({ code: "custom", message: swText("validation.seriesId") });
  if (
    ["seconds", "distance", "target", "evidence", "conditionsConfirmed"].some(
      (key) => Object.hasOwn(entry.result, key),
    )
  )
    ctx.addIssue({ code: "custom", message: swText("validation.conditions") });
  const kind = discipline(entry.discipline).kind;
  if (entry.result.dryFire && entry.discipline !== "custom")
    ctx.addIssue({ code: "custom", message: swText("validation.dryCustom") });
  if (kind === "points" && entry.result.points === undefined)
    ctx.addIssue({ code: "custom", message: swText("validation.points") });
  if (
    !["points", "dynamic", "open"].includes(kind) &&
    entry.result.hits === undefined
  )
    ctx.addIssue({
      code: "custom",
      message: swText("validation.requiredHits"),
    });
  if (
    kind === "dynamic" &&
    (!entry.result.status || entry.result.status === "completed") &&
    entry.result.hits === undefined &&
    entry.result.points === undefined
  )
    ctx.addIssue({ code: "custom", message: swText("validation.score") });
  if (
    entry.discipline === "precision" &&
    (entry.result.points ?? 0) > entry.result.shots * 10
  )
    ctx.addIssue({
      code: "custom",
      message: swText("validation.maximumPoints"),
    });
}
export const quickEntryInputSchema = z
  .object(quickFields)
  .strict()
  .superRefine(validateQuick);
export const quickEntrySchema = z
  .object({
    ...quickFields,
    recordedAt: z.iso.datetime(),
    birthDate: dateSchema.nullable(),
    birthYear: z.number().int().min(1900).nullable(),
    ruleVersion: text(120).nullable(),
  })
  .strict()
  .superRefine(validateQuick);
export type QuickEntry = z.infer<typeof quickEntrySchema>;
export type Records = {
  profile: Profile;
  firearms: Firearm[];
  sessions: Session[];
  assessments: Assessment[];
  quickEntries?: QuickEntry[];
  photos?: PhotoAsset[];
  witnessSignoffs?: WitnessSignoff[];
};
