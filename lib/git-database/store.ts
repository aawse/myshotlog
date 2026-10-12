import { swText } from "@/lib/i18n";
import { createHash } from "node:crypto";
import { z } from "../validation";
import {
  photoDraftSchema,
  photoIdSchema,
  photoAssetSchema,
  type PhotoAsset,
} from "../photos/schema";
import { validateUploadedPhoto, validatePhotoAsset } from "../photos/server";
import {
  firearmSchema,
  sessionSchema,
  profileSchema,
  quickEntrySchema,
  quickEntryInputSchema,
  type QuickEntry,
  type Records,
  type Assessment,
  type Session,
  type Profile,
} from "../models";
import { assessmentSchema, parseImport } from "../portability";
import { sessionSetup } from "../session-setup";
import { rules } from "../rules/catalog";
import { evaluate } from "../rules/engine";
import { recordSeries } from "../rules/recorded";
import {
  DatabaseConflict,
  validPath,
  type GitDatabase,
  type EntryCommit,
  type GitSnapshot,
} from "./types";
const photoFile = z
  .object({ version: z.literal(1), entry: photoAssetSchema })
  .strict();
const photoIds = (records: Records) =>
  new Set(
    [
      ...records.sessions.flatMap((s) => s.results),
      ...(records.quickEntries ?? []).map((q) => q.result),
    ].flatMap((r) => (r.photoId ? [r.photoId] : [])),
  );
const quickFile = z
  .object({ version: z.literal(1), entry: quickEntrySchema })
  .strict();
const firearmFile = z
  .object({ version: z.literal(1), entry: firearmSchema })
  .strict();
const profileFile = z
  .object({ version: z.literal(1), entry: profileSchema })
  .strict();
const sessionFile = z
  .object({
    version: z.literal(1),
    entry: sessionSchema,
    assessments: z.array(assessmentSchema),
  })
  .strict()
  .superRefine((file, ctx) => {
    if (
      new Set(file.assessments.map((a) => a.id)).size !==
        file.assessments.length ||
      file.assessments.some((a) => a.sessionId !== file.entry.id)
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid assessment ownership or duplicate ID",
      });
  });
export const defaultProfile: Profile = {
  displayName: "",
  birthDate: null,
  birthYear: null,
  language: "sv",
  timezone: "Europe/Stockholm",
};
function assessmentId(sessionId: string, resultId: string, level: string) {
  const hash = createHash("sha256")
    .update(sessionId + ":" + resultId + ":" + level)
    .digest("hex")
    .slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
}
function json(value: unknown) {
  return JSON.stringify(value, null, 2) + "\n";
}
export class GitJournalStore {
  private readonly path: string;
  private readonly photosPath: string;
  constructor(
    private provider: GitDatabase,
    ownerId: string,
    prefix = "myshotlog/v1",
  ) {
    this.path = validPath(prefix) + "/users/" + z.uuid().parse(ownerId);
    this.photosPath =
      validPath(prefix) + "/photos/users/" + z.uuid().parse(ownerId);
  }
  private readSnapshot(prefix: string) {
    return this.provider.readSnapshot
      ? this.provider.readSnapshot(prefix)
      : this.provider.snapshot(prefix);
  }
  private profilePath() {
    return this.path + "/profile.json";
  }
  private entryPath(
    kind: "firearms" | "sessions" | "quick-entries",
    id: string,
  ) {
    return this.path + "/" + kind + "/" + z.uuid().parse(id) + ".json";
  }
  private photoPath(id: string) {
    return this.photosPath + "/" + photoIdSchema.parse(id) + "/image.json";
  }
  async photo(id: string): Promise<PhotoAsset> {
    const path = this.photoPath(id);
    const snapshot = await this.readSnapshot(this.photosPath + "/" + id);
    const content = snapshot.files.get(path);
    if (!content) throw new RecordNotFound();
    const photo = photoFile.parse(JSON.parse(content)).entry;
    if (photo.id !== id) throw new InvalidRecord(swText("store.photoId"));
    return photo;
  }
  async photos(): Promise<PhotoAsset[]> {
    const snapshot = await this.readSnapshot(this.photosPath);
    return [...snapshot.files]
      .filter(
        ([path]) =>
          path.startsWith(this.photosPath + "/") &&
          path.endsWith("/image.json"),
      )
      .map(([path, content]) => {
        const photo = photoFile.parse(JSON.parse(content)).entry;
        if (path !== this.photoPath(photo.id))
          throw new InvalidRecord(swText("store.photoFile"));
        return photo;
      });
  }
  private decode(snapshot: GitSnapshot): Records {
    const records: Records = {
      profile: { ...defaultProfile },
      firearms: [],
      sessions: [],
      assessments: [],
      quickEntries: [],
    };
    for (const [path, content] of snapshot.files) {
      if (!path.startsWith(this.path + "/")) continue;
      const name = path.slice(this.path.length + 1);
      if (name === "profile.json")
        records.profile = profileFile.parse(JSON.parse(content)).entry;
      else if (/^firearms\/[^/]+\.json$/.test(name)) {
        const file = firearmFile.parse(JSON.parse(content));
        if (path !== this.entryPath("firearms", file.entry.id))
          throw new Error("Corrupt firearm file");
        records.firearms.push(file.entry);
      } else if (/^quick-entries\/[^/]+\.json$/.test(name)) {
        const file = quickFile.parse(JSON.parse(content));
        if (path !== this.entryPath("quick-entries", file.entry.id))
          throw new Error("Corrupt quick entry file");
        records.quickEntries!.push(file.entry);
      } else if (/^sessions\/[^/]+\.json$/.test(name)) {
        const file = sessionFile.parse(JSON.parse(content));
        if (path !== this.entryPath("sessions", file.entry.id))
          throw new Error("Corrupt session file");
        records.sessions.push(file.entry);
        records.assessments.push(...file.assessments);
      }
    }
    records.quickEntries!.sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt),
    );
    records.sessions.sort((a, b) => b.date.localeCompare(a.date));
    records.assessments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return records;
  }
  async records() {
    const records = this.decode(await this.readSnapshot(this.path));
    records.sessions = records.sessions.map(sessionSetup);
    const history = records.assessments;
    records.assessments = records.sessions.flatMap((session) =>
      session.results.flatMap((result) =>
        recordSeries(session, result, records.profile, history, false).map(
          (a) => ({
            ...a,
            id: assessmentId(session.id, result.id, a.level),
            createdAt:
              history.find(
                (h) => h.sessionId === session.id && h.resultId === result.id,
              )?.createdAt ?? session.date + "T00:00:00Z",
          }),
        ),
      ),
    );
    return records;
  }
  async mutate(action: string, payload: unknown, photoDrafts: unknown[] = []) {
    const drafts = z.array(photoDraftSchema).max(10).parse(photoDrafts);
    if (new Set(drafts.map((p) => p.id)).size !== drafts.length)
      throw new InvalidRecord(swText("store.duplicatePhotos"));
    if (
      drafts.length &&
      !["session", "session-with-quick", "quick-entry"].includes(action)
    )
      throw new InvalidRecord(swText("store.photoSeries"));
    const prepared = new Map<string, PhotoAsset>();
    const replacements = new Map<string, string>();
    try {
      for (const draft of drafts) {
        const photo = await validateUploadedPhoto(
          Buffer.from(draft.data, "base64"),
        );
        prepared.set(photo.id, photo);
        replacements.set(draft.id, photo.id);
      }
    } catch {
      throw new InvalidRecord(swText("store.photoOptimized"));
    }
    const patchResult = (result: unknown) => {
      if (!result || typeof result !== "object") return result;
      const r = result as Record<string, unknown>;
      return {
        ...r,
        ...(typeof r.photoId === "string" && replacements.has(r.photoId)
          ? { photoId: replacements.get(r.photoId) }
          : {}),
      };
    };
    const patchSession = (session: unknown) => {
      if (!session || typeof session !== "object") return session;
      const s = session as Record<string, unknown>;
      return {
        ...s,
        ...(Array.isArray(s.results)
          ? { results: s.results.map(patchResult) }
          : {}),
      };
    };
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      if (action === "quick-entry")
        payload = { ...p, result: patchResult(p.result) };
      else if (action === "session-with-quick")
        payload = { ...p, session: patchSession(p.session) };
      else if (action === "session") payload = patchSession(payload);
    }
    const importedPhotos = new Map<string, PhotoAsset>();
    if (action === "import") {
      const data = parseImport(payload);
      try {
        for (const photo of data.photos)
          importedPhotos.set(photo.id, await validatePhotoAsset(photo));
      } catch {
        throw new InvalidRecord(swText("store.importPhoto"));
      }
    }
    // The plan is rebuilt after a head conflict, including revision and ownership checks.
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await this.provider.snapshot(this.path),
        records = this.decode(snapshot);
      const entries: EntryCommit[] = [];
      let imported = 0;
      const put = (path: string, content: unknown, message: string) =>
        entries.push({ message, changes: [{ path, content: json(content) }] });
      if (action === "quick-entry") {
        const input = quickEntryInputSchema.parse(payload);
        const existing = records.quickEntries!.find((q) => q.id === input.id);
        if (existing) {
          if (
            JSON.stringify(
              quickEntryInputSchema.parse({
                id: existing.id,
                date: existing.date,
                discipline: existing.discipline,
                result: existing.result,
                notes: existing.notes,
              }),
            ) !== JSON.stringify(input)
          )
            throw new DatabaseConflict();
        } else {
          if (
            records.sessions.some((s) =>
              s.results.some((r) => r.id === input.id),
            )
          )
            throw new DatabaseConflict();
          const entry = quickEntrySchema.parse({
            ...input,
            recordedAt: new Date().toISOString(),
            birthDate: records.profile.birthDate,
            birthYear: records.profile.birthYear,
            ruleVersion:
              rules.find((r) => r.from <= input.date && input.date < r.until)
                ?.id ?? null,
          });
          put(
            this.entryPath("quick-entries", entry.id),
            { version: 1, entry },
            "MyShotLog: save quick series " + entry.id,
          );
        }
      } else if (action === "delete-quick-entry") {
        const { id } = z.object({ id: z.uuid() }).strict().parse(payload);
        if (!records.quickEntries!.some((q) => q.id === id))
          throw new RecordNotFound();
        entries.push({
          message: "MyShotLog: remove quick series " + id,
          changes: [
            { path: this.entryPath("quick-entries", id), content: null },
          ],
        });
      } else if (action === "profile") {
        put(
          this.profilePath(),
          { version: 1, entry: profileSchema.parse(payload) },
          "MyShotLog: save profile",
        );
      } else if (action === "firearm") {
        const entry = firearmSchema.parse(payload);
        put(
          this.entryPath("firearms", entry.id),
          { version: 1, entry },
          "MyShotLog: save firearm " + entry.id,
        );
      } else if (
        ["session", "session-with-quick", "attach-quick"].includes(action)
      ) {
        let quick: QuickEntry[] = [];
        let sessionPayload = payload;
        if (action !== "session") {
          const request = z
            .object({
              ids: z.array(z.uuid()).min(1).max(100),
              session: z.unknown().optional(),
              sessionId: z.uuid().optional(),
              revision: z.number().int().optional(),
            })
            .strict()
            .parse(payload);
          if (new Set(request.ids).size !== request.ids.length)
            throw new InvalidRecord(swText("store.duplicateSeries"));
          quick = request.ids.map((id) => {
            const entry = records.quickEntries!.find((q) => q.id === id);
            if (!entry) throw new RecordNotFound();
            return entry;
          });
          if (action === "attach-quick") {
            const existing = records.sessions.find(
              (s) => s.id === request.sessionId,
            );
            if (!existing) throw new RecordNotFound();
            if (existing.revision !== request.revision)
              throw new DatabaseConflict();
            sessionPayload = {
              ...sessionSetup(existing),
              revision: existing.revision + 1,
              results: [...existing.results, ...quick.map((q) => q.result)],
              notes: [existing.notes, ...quick.map((q) => q.notes)]
                .filter(Boolean)
                .join("\n"),
            };
          } else sessionPayload = request.session;
        }
        let entry: Session;
        {
          entry = sessionSchema.parse(sessionPayload);
          if (
            quick.some(
              (q) => q.date !== entry.date || q.discipline !== entry.discipline,
            )
          )
            throw new InvalidRecord(swText("store.matchSession"));
          if (quick.some((q) => !entry.results.some((r) => r.id === q.id)))
            throw new InvalidRecord(swText("store.seriesMissing"));
          if (
            quick.some((q) =>
              records.sessions.some((s) =>
                s.results.some((r) => r.id === q.id),
              ),
            )
          )
            throw new InvalidRecord(swText("store.alreadyAttached"));
          if (
            entry.results.some(
              (r) =>
                records.quickEntries!.some((q) => q.id === r.id) &&
                !quick.some((q) => q.id === r.id),
            )
          )
            throw new InvalidRecord(swText("store.attachQuick"));
          const existing = records.sessions.find((s) => s.id === entry.id);
          if (entry.revision !== (existing?.revision ?? 0) + 1)
            throw new DatabaseConflict();
          if (existing && existing.firearmId === entry.firearmId)
            entry.firearmSnapshot = existing.firearmSnapshot;
          else if (entry.firearmId) {
            const firearm = records.firearms.find(
              (f) => f.id === entry.firearmId && !f.archived,
            );
            if (!firearm)
              throw new InvalidRecord(swText("store.firearmMissing"));
            const { serial, notes, archived, defaultDiscipline, ...saved } =
              firearm;
            void serial;
            void notes;
            void archived;
            void defaultDiscipline;
            entry.firearmSnapshot = saved;
          } else entry.firearmSnapshot = null;
        }
        const previous = records.assessments.filter(
          (a) => a.sessionId === entry.id,
        );
        const existing = records.sessions.find((s) => s.id === entry.id);
        const assessments: Assessment[] = entry.results.flatMap((result) =>
          recordSeries(
            entry,
            result,
            quick.some((q) => q.id === result.id)
              ? {
                  ...records.profile,
                  birthDate: quick.find((q) => q.id === result.id)!.birthDate,
                  birthYear: quick.find((q) => q.id === result.id)!.birthYear,
                }
              : records.profile,
            previous,
            !existing?.results.some((r) => r.id === result.id) &&
              !previous.some((a) => a.resultId === result.id),
          ).map((a) => ({
            ...a,
            id: crypto.randomUUID(),
            createdAt:
              quick.find((q) => q.id === result.id)?.recordedAt ??
              new Date().toISOString(),
          })),
        );
        put(
          this.entryPath("sessions", entry.id),
          { version: 1, entry, assessments: [...previous, ...assessments] },
          `MyShotLog: save session ${entry.id} revision ${entry.revision}`,
        );
        for (const q of quick)
          entries.push({
            message:
              "MyShotLog: link quick series " +
              q.id +
              " to session " +
              entry.id,
            changes: [
              { path: this.entryPath("quick-entries", q.id), content: null },
            ],
          });
      } else if (action === "delete-session") {
        const { id } = z.object({ id: z.uuid() }).strict().parse(payload);
        if (!records.sessions.some((s) => s.id === id))
          throw new RecordNotFound();
        entries.push({
          message: "MyShotLog: remove session " + id,
          changes: [{ path: this.entryPath("sessions", id), content: null }],
        });
      } else if (action === "import") {
        const data = parseImport(payload);
        if (!snapshot.files.has(this.profilePath()))
          put(
            this.profilePath(),
            { version: 1, entry: data.profile },
            "MyShotLog: import profile",
          );
        for (const entry of data.quickEntries)
          if (
            !records.quickEntries!.some((q) => q.id === entry.id) &&
            !records.sessions.some((s) =>
              s.results.some((r) => r.id === entry.id),
            )
          )
            put(
              this.entryPath("quick-entries", entry.id),
              { version: 1, entry },
              "MyShotLog: import quick series " + entry.id,
            );
        for (const entry of data.firearms)
          if (!records.firearms.some((f) => f.id === entry.id))
            put(
              this.entryPath("firearms", entry.id),
              { version: 1, entry },
              "MyShotLog: import firearm " + entry.id,
            );
        for (const entry of data.sessions)
          if (!records.sessions.some((s) => s.id === entry.id)) {
            put(
              this.entryPath("sessions", entry.id),
              {
                version: 1,
                entry,
                assessments: entry.results.flatMap((result) => {
                  const context = data.recordingContexts.find(
                    (c) => c.sessionId === entry.id && c.resultId === result.id,
                  );
                  const profile = context
                    ? profileSchema.parse({
                        ...data.profile,
                        birthDate: context.birthDate,
                        birthYear: context.birthYear,
                      })
                    : data.profile;
                  return evaluate(sessionSetup(entry), result, profile).map(
                    (a) => ({
                      ...a,
                      id: crypto.randomUUID(),
                      createdAt: new Date().toISOString(),
                    }),
                  );
                }),
              },
              "MyShotLog: import session " + entry.id,
            );
            imported++;
          }
      } else if (action === "delete-records") {
        z.object({ confirm: z.literal("RADERA") })
          .strict()
          .parse(payload);
        for (const entry of records.quickEntries!)
          entries.push({
            message: "MyShotLog: remove quick series " + entry.id,
            changes: [
              {
                path: this.entryPath("quick-entries", entry.id),
                content: null,
              },
            ],
          });
        // One removal commit per entry. Publish the entire chain atomically.
        for (const entry of records.sessions)
          entries.push({
            message: "MyShotLog: remove session " + entry.id,
            changes: [
              { path: this.entryPath("sessions", entry.id), content: null },
            ],
          });
        for (const entry of records.firearms)
          entries.push({
            message: "MyShotLog: remove firearm " + entry.id,
            changes: [
              { path: this.entryPath("firearms", entry.id), content: null },
            ],
          });
        if (snapshot.files.has(this.profilePath()))
          entries.push({
            message: "MyShotLog: remove profile",
            changes: [{ path: this.profilePath(), content: null }],
          });
      } else throw new InvalidRecord(swText("store.unknownAction"));
      const nextFiles = new Map(snapshot.files);
      for (const entry of entries)
        for (const change of entry.changes) {
          if (change.content === null) nextFiles.delete(change.path);
          else nextFiles.set(change.path, change.content);
        }
      const previousIds = photoIds(records),
        nextIds = photoIds(this.decode({ ...snapshot, files: nextFiles }));
      for (const id of prepared.keys())
        if (!nextIds.has(id))
          throw new InvalidRecord(swText("store.orphanPhoto"));
      for (const id of nextIds) {
        if (previousIds.has(id)) continue;
        const photo = prepared.get(id) ?? importedPhotos.get(id);
        if (!photo) throw new InvalidRecord(swText("store.missingPhoto"));
        entries.unshift({
          message: "MyShotLog: save optimized target photo " + id,
          changes: [
            {
              path: this.photoPath(id),
              content: json({ version: 1, entry: photo }),
            },
          ],
        });
      }
      for (const id of previousIds)
        if (!nextIds.has(id))
          entries.push({
            message: "MyShotLog: remove target photo " + id,
            changes: [{ path: this.photoPath(id), content: null }],
          });
      try {
        const receipt = await this.provider.publish(snapshot, entries);
        return {
          ok: true,
          imported,
          head: receipt.head,
          commits: receipt.commits,
        };
      } catch (e) {
        if (e instanceof DatabaseConflict && attempt < 2) continue;
        throw e;
      }
    }
    throw new DatabaseConflict();
  }
}
export class RecordNotFound extends Error {
  constructor() {
    super(swText("store.notFound"));
  }
}
export class InvalidRecord extends Error {}
