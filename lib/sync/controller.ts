import { z } from "../validation";
import {
  actions,
  normalizePayload,
  operationSchema,
  project,
  recordsSchema,
  targetsFor,
  canonical,
  applyOperation,
  headSchema,
  conflictSchema,
  type Operation,
  type Target,
} from "./model";
import {
  initialState,
  pendingBatch,
  dependentIds,
  prunePhotos,
  type BrowserState,
  type BrowserStorage,
  type SyncIssue,
} from "./storage";
import { prepareQueuedPhotos } from "./photos";
import type { PhotoDraft } from "../photos/schema";
import type { Records } from "../models";
export type SyncStatus =
  | "loading"
  | "synced"
  | "pending"
  | "syncing"
  | "offline"
  | "conflict"
  | "authentication"
  | "error"
  | "storage";
export type SyncSnapshot = {
  state: BrowserState;
  records: Records | null;
  status: SyncStatus;
  error?: string;
};
const replySchema = z.object({
  scope: z.string(),
  head: headSchema,
  records: recordsSchema.optional(),
  unchanged: z.boolean().optional(),
  acknowledged: z.array(z.uuid()).optional(),
  conflict: conflictSchema.optional(),
});
export class BrowserJournal {
  private state: BrowserState;
  private snapshot: SyncSnapshot;
  private listeners = new Set<() => void>();
  private running?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private disposed = false;
  private starting?: Promise<void>;
  private channel?: BroadcastChannel;
  private photoRequests = new Map<string, Promise<string>>();
  private problem?: string;
  private authenticationBlocked = false;
  constructor(
    readonly scope: string,
    private storage: BrowserStorage,
    private request: typeof fetch = (input, init) =>
      globalThis.fetch(input, init),
    private online: () => boolean = () => navigator.onLine,
  ) {
    this.state = initialState(scope);
    this.snapshot = { state: this.state, records: null, status: "loading" };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(status?: SyncStatus) {
    if (this.disposed) return;
    const problemStatus =
      this.problem === "sync.storageError"
        ? "storage"
        : !this.online()
          ? "offline"
          : this.problem
            ? "error"
            : undefined;
    this.snapshot = {
      state: this.state,
      records:
        this.snapshot.state === this.state
          ? this.snapshot.records
          : this.state.records
            ? project(this.state.records, this.state.pending)
            : null,
      status: this.authenticationBlocked
        ? "authentication"
        : (status ??
          problemStatus ??
          (this.state.conflict
            ? "conflict"
            : !this.state.records
              ? "loading"
              : this.state.pending.length
                ? "pending"
                : "synced")),
      ...(this.problem ? { error: this.problem } : {}),
    };
    this.listeners.forEach((listener) => listener());
  }
  private async update(change: (state: BrowserState) => BrowserState) {
    this.state = await this.storage.update(this.scope, (state) =>
      prunePhotos(change(state)),
    );
    this.emit();
    this.channel?.postMessage("changed");
  }
  start() {
    return (this.starting ??= this.initialize());
  }
  private async initialize() {
    try {
      this.state = await this.storage.load(this.scope);
      this.emit();
    } catch {
      this.problem = "sync.storageError";
      this.emit("storage");
    }
    if (this.disposed) return;
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("myshotlog-sync-" + this.scope);
      this.channel.onmessage = () => {
        void this.reload().then(() => this.schedule(3000));
      };
    }
    await this.sync();
  }
  async reload() {
    try {
      this.state = await this.storage.load(this.scope);
      this.emit();
      return true;
    } catch {
      this.problem = "sync.storageError";
      this.emit("storage");
      return false;
    }
  }
  schedule(delay = 1500) {
    clearTimeout(this.timer);
    if (this.disposed) return;
    this.timer = setTimeout(() => {
      if (typeof document !== "undefined" && document.hidden) {
        this.schedule(30000);
        return;
      }
      void this.sync();
    }, delay);
  }
  private async readResponse(response: Response) {
    if (response.status === 401) return this.deny("sync.authentication");
    if (response.status === 403) {
      const denial = z
        .object({ error: z.enum(["origin", "scope"]) })
        .safeParse(await response.json().catch(() => null));
      if (denial.success && denial.data.error === "origin")
        throw new Error("sync.origin");
      return this.deny(denial.success ? "sync.scope" : "sync.authentication");
    }
    if (response.status === 429) throw new Error("sync.rateLimited");
    if (response.status === 413) throw new Error("sync.tooLarge");
    if (response.status === 400) throw new Error("sync.invalid");
    if (response.status === 503) throw new Error("sync.unavailable");
    if (!response.ok && response.status !== 409) throw new Error("sync.failed");
    const body: unknown = await response.json();
    if (
      response.status === 409 &&
      z.object({ error: z.literal("retry") }).safeParse(body).success
    )
      throw new Error("sync.serverBusy");
    const data = replySchema.parse(body);
    if (data.scope !== this.scope) return this.deny("sync.scope");
    this.authenticationBlocked = false;
    return data;
  }
  private deny(problem: "sync.authentication" | "sync.scope"): never {
    this.authenticationBlocked = true;
    this.problem = problem;
    this.emit("authentication");
    throw new Error(problem);
  }
  sync = (reviewId?: string): Promise<void> => {
    if (this.running)
      return reviewId
        ? this.running.then(() => this.sync(reviewId))
        : this.running;
    this.running = this.coordinateSync(reviewId).finally(() => {
      this.running = undefined;
    });
    return this.running;
  };
  private async withSyncLock(work: () => Promise<void>) {
    if (typeof navigator !== "undefined" && navigator.locks) {
      let entered = false;
      try {
        return await navigator.locks.request(
          "myshotlog-sync-" + this.scope,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) return false;
            entered = true;
            await work();
            return true;
          },
        );
      } catch (error) {
        if (entered) throw error;
      }
    }
    const owner = crypto.randomUUID();
    if (!(await this.storage.claim(this.scope, owner, Date.now())))
      return false;
    try {
      await work();
      return true;
    } finally {
      await this.storage.release(this.scope, owner).catch(() => {});
    }
  }
  private async coordinateSync(reviewId?: string) {
    if (this.disposed) return;
    if (!this.online()) {
      this.emit("offline");
      this.schedule(30000);
      return;
    }
    try {
      if (!(await this.withSyncLock(() => this.performSync(reviewId)))) {
        await this.reload();
        this.schedule(3000);
      }
    } catch {
      this.problem = "sync.storageError";
      this.emit("storage");
      this.schedule(30000);
    }
  }
  private async performSync(reviewId?: string) {
    if (this.disposed) return;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!(await this.reload())) return;
      if (this.state.conflict && this.state.conflict.id !== reviewId) {
        return;
      }
      this.problem = undefined;
      this.emit(
        !this.state.records || this.state.pending.length
          ? "syncing"
          : undefined,
      );
      this.controller = new AbortController();
      deadline = setTimeout(() => this.controller?.abort(), 55000);
      const signal = this.controller.signal;
      const query = new URLSearchParams({
        scope: this.scope,
        ...(this.state.head ? { head: this.state.head } : {}),
      });
      const remote = await this.readResponse(
        await this.request("/api/sync/?" + query, {
          cache: "no-store",
          signal,
        }),
      );
      // A failed recheck must leave the reviewed GitHub record and base together.
      if (!remote.unchanged && !this.state.conflict) {
        const records = remote.records;
        if (!records) throw new Error("sync.failed");
        await this.update((state) => ({
          ...state,
          head: remote.head,
          records,
          syncedAt: new Date().toISOString(),
        }));
      }
      if (this.disposed) return;
      const batch = pendingBatch(this.state.pending);
      if (batch.length) {
        this.emit("syncing");
        const response = await this.request("/api/sync/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: this.scope,
            head: remote.head,
            operations: batch,
          }),
          signal,
        });
        const result = await this.readResponse(response);
        const { records, conflict } = result;
        if (!records) throw new Error("sync.failed");
        const ids = new Set(batch.map((operation) => operation.id));
        const acknowledged = new Set(result.acknowledged);
        if (
          acknowledged.size !== (result.acknowledged?.length ?? 0) ||
          [...acknowledged].some((id) => !ids.has(id))
        )
          throw new Error("sync.failed");
        if (response.status === 409) {
          if (
            !conflict ||
            !ids.has(conflict.id) ||
            acknowledged.has(conflict.id)
          )
            throw new Error("sync.failed");
          await this.update((state) => ({
            ...state,
            head: result.head,
            records,
            conflict,
            pending: state.pending.filter(
              (operation) => !acknowledged.has(operation.id),
            ),
          }));
          this.emit("conflict");
          return;
        }
        if (acknowledged.size !== ids.size) throw new Error("sync.failed");
        await this.update((state) => ({
          ...state,
          head: result.head,
          records,
          pending: state.pending.filter((o) => !acknowledged.has(o.id)),
          syncedAt: new Date().toISOString(),
          conflict: null,
        }));
      }
      this.problem = undefined;
      this.emit();
    } catch (error) {
      if (this.disposed) return;
      const message = error instanceof Error ? error.message : "sync.failed";
      if (!this.authenticationBlocked || this.problem === undefined) {
        this.problem = this.controller?.signal.aborted
          ? "sync.timedOut"
          : message.startsWith("sync.")
            ? message
            : "sync.failed";
        this.emit(
          this.problem === "sync.storageError"
            ? "storage"
            : this.online()
              ? "error"
              : "offline",
        );
      }
    } finally {
      clearTimeout(deadline);
      this.controller = undefined;
      if (
        !this.disposed &&
        !this.state.conflict &&
        !this.authenticationBlocked &&
        !["sync.invalid", "sync.tooLarge", "sync.origin"].includes(
          this.problem ?? "",
        )
      )
        this.schedule(
          this.state.pending.length && !this.problem ? 1500 : 30000,
        );
    }
  }
  async enqueue(
    action: string,
    payload: unknown,
    photos: PhotoDraft[] = [],
    expected: Target[] = [],
  ) {
    if (this.authenticationBlocked) throw new Error("sync.authentication");
    if (!actions.includes(action as Operation["action"]))
      throw new Error("sync.onlineOnly");
    if (photos.length > 10) throw new Error("sync.invalidPhoto");
    const prepared = await prepareQueuedPhotos(payload, photos),
      normalized = normalizePayload(
        action as Operation["action"],
        prepared.payload,
      );
    const id = crypto.randomUUID(),
      recordedAt = new Date().toISOString();
    await this.update((state) => {
      if (!state.records) throw new Error("sync.notReady");
      if (state.pending.length >= 200) throw new Error("sync.queueFull");
      const view = project(state.records, state.pending),
        base = targetsFor(action as Operation["action"], normalized, view);
      for (const target of expected) {
        const at = base.findIndex(
          (t) => t.kind === target.kind && t.id === target.id,
        );
        if (at >= 0) base[at] = target;
      }
      const operation = operationSchema.parse({
        id,
        action,
        payload: normalized,
        photos,
        base,
        recording: {
          recordedAt,
          birthDate: view.profile.birthDate,
          birthYear: view.profile.birthYear,
        },
      });
      // Validate local dependencies before acknowledging a save.
      applyOperation(view, operation);
      pendingBatch([operation]);
      return {
        ...state,
        pending: [...state.pending, operation],
        photos: { ...state.photos, ...prepared.cached },
      };
    });
    this.schedule();
    return { ok: true, queued: true, imported: 0 };
  }
  async ensureSynced() {
    for (let attempt = 0; attempt < 12; attempt++) {
      await this.sync();
      if (this.snapshot.status === "synced") return;
      if (this.problem || this.state.conflict || !this.online()) break;
    }
    throw new Error("sync.mustSync");
  }
  async refresh(clear = false) {
    await this.update((state) => ({
      ...state,
      head: null,
      ...(clear
        ? {
            records: {
              profile: {
                displayName: "",
                birthDate: null,
                birthYear: null,
                language: "sv" as const,
                timezone: "Europe/Stockholm",
              },
              firearms: [],
              sessions: [],
              assessments: [],
              quickEntries: [],
              witnessSignoffs: [],
            },
            photos: {},
          }
        : {}),
    }));
    await this.sync();
  }
  async resolve(
    reviewed: SyncIssue,
    keepLocal: boolean,
    discardCount?: number,
  ) {
    const { id } = reviewed;
    await this.running;
    try {
      const acquired = await this.withSyncLock(async () => {
        await this.update((state) => {
          const index = state.pending.findIndex(
            (operation) => operation.id === id,
          );
          if (
            state.conflict?.id !== id ||
            !state.records ||
            index < 0 ||
            canonical(state.conflict) !== canonical(reviewed)
          )
            throw new Error("sync.reviewChanged");
          if (!keepLocal) {
            const related = dependentIds(state.pending, id);
            if (!related.size || related.size !== discardCount)
              throw new Error("sync.reviewChanged");
            return {
              ...state,
              pending: state.pending.filter((o) => !related.has(o.id)),
              conflict: null,
            };
          }
          if (state.conflict.reason) throw new Error("sync.resolveFailed");
          const operation = state.pending[index];
          const view = project(state.records, state.pending.slice(0, index));
          const payload = structuredClone(operation.payload) as Record<
            string,
            unknown
          >;
          if (operation.action === "session")
            payload.revision =
              (view.sessions.find((s) => s.id === payload.id)?.revision ?? 0) +
              1;
          if (operation.action === "session-with-quick") {
            const session = payload.session as Record<string, unknown>;
            session.revision =
              (view.sessions.find((s) => s.id === session.id)?.revision ?? 0) +
              1;
          }
          if (
            operation.action === "attach-quick" ||
            operation.action === "evaluate-session"
          ) {
            const revision = view.sessions.find(
              (s) => s.id === payload.sessionId,
            )?.revision;
            if (revision === undefined)
              throw new Error("sync.missingDependency");
            payload.revision = revision;
          }
          const next = operationSchema.parse({
            ...operation,
            id: crypto.randomUUID(),
            payload,
            base: targetsFor(operation.action, payload, view),
          });
          applyOperation(view, next);
          pendingBatch([next]);
          const pending = [...state.pending];
          pending[index] = next;
          return { ...state, pending, conflict: null };
        });
      });
      if (!acquired) throw new Error("sync.reviewChanged");
    } catch (error) {
      await this.reload();
      throw error;
    }
    this.problem = undefined;
    this.emit();
    this.schedule(0);
  }
  async cachePhoto(id: string, source: string) {
    if (this.state.photos[id]) return this.state.photos[id];
    const pending = this.photoRequests.get(id);
    if (pending) return pending;
    const load = this.loadPhoto(id, source);
    this.photoRequests.set(id, load);
    try {
      return await load;
    } finally {
      this.photoRequests.delete(id);
    }
  }
  private async loadPhoto(id: string, source: string) {
    if (this.state.photos[id]) return this.state.photos[id];
    const response = await this.request(source, { cache: "no-store" });
    if (!response.ok) throw new Error("sync.failed");
    const blob = await response.blob();
    if (blob.size > 180000 || !["image/jpeg", "image/webp"].includes(blob.type))
      throw new Error("sync.invalidPhoto");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await this.update((state) => ({
      ...state,
      photos: { ...state.photos, [id]: data },
    }));
    return data;
  }
  async restore(value: unknown) {
    const backup = z
      .object({
        format: z.literal("myshotlog-pending"),
        version: z.literal(1),
        scope: z.literal(this.scope),
        operations: z.array(operationSchema).max(200),
        photos: z.record(z.string(), z.string()),
      })
      .strict()
      .parse(value);
    await this.update((state) => {
      const operations = new Map(state.pending.map((o) => [o.id, o]));
      for (const operation of backup.operations) {
        normalizePayload(operation.action, operation.payload);
        pendingBatch([operation]);
        if (
          operations.has(operation.id) &&
          canonical(operations.get(operation.id)) !== canonical(operation)
        )
          throw new Error("sync.invalid");
        operations.set(operation.id, operation);
      }
      return {
        ...state,
        pending: [...operations.values()],
        photos: { ...state.photos, ...backup.photos },
      };
    });
    this.schedule(0);
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.channel?.close();
  }
}
