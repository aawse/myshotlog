import { suggestedRuleReference } from "../events/programs";
import { z } from "../validation";
import {
  dateSchema,
  profileSchema,
  firearmSchema,
  sessionSchema,
  quickEntrySchema,
  quickEntryInputSchema,
  type Records,
  type Profile,
  type Session,
} from "../models";
import { assessmentSchema } from "../portability";
import { witnessSchema } from "../witness/model";
import { photoDraftSchema } from "../photos/schema";
import { rules } from "../rules/catalog";
import { recordSeries } from "../rules/recorded";
import { sessionSetup } from "../session-setup";
export const headSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .nullable();
export const recordingSchema = z
  .object({
    recordedAt: z.iso.datetime(),
    birthDate: dateSchema.nullable(),
    birthYear: z.number().int().min(1900).nullable(),
  })
  .strict();
export type RecordingContext = z.infer<typeof recordingSchema>;
export const recordsSchema = z
  .object({
    profile: profileSchema,
    firearms: z.array(firearmSchema).max(10000),
    sessions: z.array(sessionSchema).max(10000),
    assessments: z.array(assessmentSchema).max(100000),
    quickEntries: z.array(quickEntrySchema).max(10000).optional(),
    witnessSignoffs: z.array(witnessSchema).max(10000).optional(),
  })
  .strict();
export const actions = [
  "profile",
  "firearm",
  "session",
  "session-with-quick",
  "attach-quick",
  "quick-entry",
  "delete-session",
  "delete-quick-entry",
] as const;
export const targetSchema = z
  .object({
    kind: z.enum(["profile", "firearm", "session", "quick-entry"]),
    id: z.uuid().nullable(),
    value: z.unknown(),
  })
  .strict();
export type Target = z.infer<typeof targetSchema>;
export const operationSchema = z
  .object({
    id: z.uuid(),
    action: z.enum(actions),
    payload: z.unknown(),
    photos: z.array(photoDraftSchema).max(10),
    recording: recordingSchema,
    base: z.array(targetSchema).min(1).max(101),
  })
  .strict();
export type Operation = z.infer<typeof operationSchema>;
export const batchSchema = z
  .object({
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    head: headSchema,
    operations: z.array(operationSchema).min(1).max(20),
  })
  .strict()
  .refine(
    (b) => new Set(b.operations.map((o) => o.id)).size === b.operations.length,
  );
export const emptyRecords = (): Records => ({
  profile: {
    displayName: "",
    birthDate: null,
    birthYear: null,
    language: "sv",
    timezone: "Europe/Stockholm",
  },
  firearms: [],
  sessions: [],
  assessments: [],
  quickEntries: [],
  witnessSignoffs: [],
});
export function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function valueAt(
  data: Records,
  target: Pick<Target, "kind" | "id">,
): unknown {
  if (target.kind === "profile") return data.profile;
  const entries =
    target.kind === "firearm"
      ? data.firearms
      : target.kind === "session"
        ? data.sessions
        : (data.quickEntries ?? []);
  return entries.find((e) => e.id === target.id) ?? null;
}
const idsSchema = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
const linkSchema = z
  .object({
    ids: idsSchema,
    session: z.unknown().optional(),
    sessionId: z.uuid().optional(),
    revision: z.number().int().optional(),
  })
  .strict();
export function normalizePayload(
  action: Operation["action"],
  payload: unknown,
): unknown {
  if (action === "profile") return profileSchema.parse(payload);
  if (action === "firearm") return firearmSchema.parse(payload);
  if (action === "session") return sessionSchema.parse(payload);
  if (action === "quick-entry") return quickEntryInputSchema.parse(payload);
  if (action === "delete-session" || action === "delete-quick-entry")
    return z.object({ id: z.uuid() }).strict().parse(payload);
  const link = linkSchema.parse(payload);
  if (action === "session-with-quick")
    return { ids: link.ids, session: sessionSchema.parse(link.session) };
  return {
    ids: link.ids,
    sessionId: z.uuid().parse(link.sessionId),
    revision: z.number().int().min(1).parse(link.revision),
  };
}
export function targetsFor(
  action: Operation["action"],
  payload: unknown,
  data: Records,
): Target[] {
  const p = normalizePayload(action, payload) as {
    id?: string;
    ids?: string[];
    session?: Session;
    sessionId?: string;
  };
  const keys: Pick<Target, "kind" | "id">[] =
    action === "profile"
      ? [{ kind: "profile", id: null }]
      : action === "firearm"
        ? [{ kind: "firearm", id: p.id! }]
        : ["quick-entry", "delete-quick-entry"].includes(action)
          ? [{ kind: "quick-entry", id: p.id! }]
          : [
              { kind: "session", id: p.session?.id ?? p.sessionId ?? p.id! },
              ...(p.ids ?? []).map((id) => ({
                kind: "quick-entry" as const,
                id,
              })),
            ];
  return keys.map((key) => ({ ...key, value: valueAt(data, key) }));
}
export function sameTargets(a: Target[], b: Target[]) {
  return canonical(a) === canonical(b);
}
export function capturedProfile(
  profile: Profile,
  recording: RecordingContext,
): Profile {
  return profileSchema.parse({
    ...profile,
    birthDate: recording.birthDate,
    birthYear: recording.birthYear,
  });
}
/** Project validated pending changes. Git remains authoritative after acknowledgement. */
export function applyOperation(data: Records, operation: Operation): Records {
  const next = structuredClone(data),
    action = operation.action;
  const payload = normalizePayload(action, operation.payload);
  if (action === "profile") next.profile = payload as Profile;
  else if (action === "firearm") {
    const f = firearmSchema.parse(payload);
    next.firearms = [...next.firearms.filter((e) => e.id !== f.id), f];
  } else if (action === "quick-entry") {
    const q = quickEntryInputSchema.parse(payload);
    next.quickEntries = [
      ...(next.quickEntries ?? []).filter((e) => e.id !== q.id),
      {
        ...q,
        ...operation.recording,
        ruleVersion:
          q.discipline.startsWith("ipsc-") ||
          ["nordic-steel", "dmr", "custom"].includes(q.discipline)
            ? (suggestedRuleReference(q.discipline, q.date) ?? null)
            : (rules.find((v) => v.from <= q.date && q.date < v.until)?.id ??
              null),
      },
    ];
  } else if (action === "delete-quick-entry")
    next.quickEntries = (next.quickEntries ?? []).filter(
      (e) => e.id !== (payload as { id: string }).id,
    );
  else if (action === "delete-session") {
    const id = (payload as { id: string }).id;
    next.sessions = next.sessions.filter((s) => s.id !== id);
    next.assessments = next.assessments.filter((a) => a.sessionId !== id);
    next.witnessSignoffs = next.witnessSignoffs?.filter(
      (w) => w.sessionId !== id,
    );
  } else {
    const link = payload as {
      ids?: string[];
      session?: Session;
      sessionId?: string;
      revision?: number;
    };
    const quick = (link.ids ?? []).map((id) => {
      const q = next.quickEntries?.find((q) => q.id === id);
      if (!q) throw new Error("sync.missingDependency");
      return q;
    });
    let s: Session;
    if (action === "attach-quick") {
      const existing = next.sessions.find((s) => s.id === link.sessionId);
      if (!existing) throw new Error("sync.missingDependency");
      s = sessionSchema.parse({
        ...sessionSetup(existing),
        revision: existing.revision + 1,
        results: [...existing.results, ...quick.map((q) => q.result)],
        notes: [existing.notes, ...quick.map((q) => q.notes)]
          .filter(Boolean)
          .join("\n"),
      });
    } else
      s = sessionSchema.parse(action === "session" ? payload : link.session);
    if (
      quick.some(
        (q) =>
          q.date !== s.date ||
          q.discipline !== s.discipline ||
          Boolean(q.presetId && q.presetId !== s.presetId) ||
          !s.results.some((r) => r.id === q.id),
      )
    )
      throw new Error("sync.missingDependency");
    const existing = next.sessions.find((e) => e.id === s.id);
    if (existing && existing.firearmId === s.firearmId)
      s.firearmSnapshot = existing.firearmSnapshot;
    else if (s.firearmId) {
      const firearm = next.firearms.find(
        (f) => f.id === s.firearmId && !f.archived,
      );
      if (!firearm) throw new Error("sync.missingDependency");
      const {
        serial: _serial,
        notes: _notes,
        archived: _archived,
        defaultDiscipline: _sport,
        ...snapshot
      } = firearm;
      s.firearmSnapshot = snapshot;
    } else s.firearmSnapshot = null;
    s = sessionSetup(s);
    const previous = next.assessments.filter((a) => a.sessionId === s.id);
    const assessments = s.results.flatMap((result) => {
      const q = quick.find((q) => q.id === result.id);
      const profile = q
        ? capturedProfile(next.profile, q)
        : capturedProfile(next.profile, operation.recording);
      return recordSeries(s, result, profile, previous).map((a, i) => ({
        ...a,
        id: result.id.slice(0, 24) + operation.id.slice(24, 35) + i,
        createdAt:
          previous.find((a) => a.resultId === result.id)?.createdAt ??
          q?.recordedAt ??
          operation.recording.recordedAt,
      }));
    });
    next.sessions = [...next.sessions.filter((e) => e.id !== s.id), s];
    next.assessments = [
      ...next.assessments.filter((a) => a.sessionId !== s.id),
      ...assessments,
    ];
    next.quickEntries = next.quickEntries?.filter(
      (q) => !quick.some((entry) => entry.id === q.id),
    );
  }
  next.sessions.sort((a, b) => b.date.localeCompare(a.date));
  next.quickEntries?.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return next;
}
export function project(data: Records, operations: Operation[]) {
  let view = data;
  for (const operation of operations) {
    try {
      view = applyOperation(view, operation);
    } catch {
      /* Pending dependency errors remain visible in sync status. */
    }
  }
  return view;
}
