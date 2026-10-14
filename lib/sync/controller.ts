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
  conflict: z
    .object({
      id: z.uuid(),
      current: z
        .array(
          z
            .object({
              kind: z.enum(["profile", "firearm", "session", "quick-entry"]),
              id: z.uuid().nullable(),
              value: z.unknown(),
            })
            .strict(),
        )
        .max(101),
    })
    .optional(),
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
  private instance = crypto.randomUUID();
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
    } catch {
      this.problem = "sync.storageError";
      this.emit("storage");
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
    if (response.status === 401 || response.status === 403) {
      this.authenticationBlocked = true;
      this.problem = "sync.authentication";
      this.emit("authentication");
      throw new Error("sync.authentication");
    }
    if (response.status === 429) {
      this.problem = "sync.rateLimited";
      throw new Error("sync.rateLimited");
    }
    if (!response.ok && response.status !== 409)
      throw new Error(
        response.status === 400 || response.status === 413
          ? "sync.invalid"
          : "sync.failed",
      );
    const data = replySchema.parse(await response.json());
    if (data.scope !== this.scope) throw new Error("sync.authentication");
    this.authenticationBlocked = false;
    return data;
  }
  sync = (): Promise<void> => {
    if (this.running) return this.running;
    this.running = this.coordinateSync().finally(() => {
      this.running = undefined;
    });
    return this.running;
  };
  private async coordinateSync() {
    if (typeof navigator !== "undefined" && navigator.locks) {
      try {
        await navigator.locks.request(
          "myshotlog-sync-" + this.scope,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              await this.reload();
              this.schedule(3000);
              return;
            }
            await this.performSync(false);
          },
        );
        return;
      } catch {
        /* Fall back to an atomic IndexedDB lease where Web Locks are unavailable. */
      }
    }
    await this.performSync(true);
  }
  private async performSync(useLease = true) {
    if (this.disposed) return;
    if (!this.online()) {
      this.emit("offline");
      this.schedule(30000);
      return;
    }
    let leased = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      leased =
        !useLease ||
        (await this.storage.claim(this.scope, this.instance, Date.now()));
      if (!leased) {
        await this.reload();
        this.schedule(3000);
        return;
      }
      await this.reload();
      if (this.state.conflict) {
        this.emit("conflict");
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
      if (!remote.unchanged) {
        if (!remote.records) throw new Error("sync.failed");
        await this.update((state) => ({
          ...state,
          head: remote.head,
          records: remote.records!,
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
            head: this.state.head,
            operations: batch,
          }),
          signal,
        });
        const result = await this.readResponse(response);
        if (!result.records) throw new Error("sync.failed");
        if (response.status === 409) {
          const confirmed = new Set(result.acknowledged ?? []);
          if (
            [...confirmed].some(
              (id) => !batch.some((operation) => operation.id === id),
            )
          )
            throw new Error("sync.failed");
          if (!result.conflict) throw new Error("sync.failed");
          await this.update((state) => ({
            ...state,
            head: result.head,
            records: result.records!,
            conflict: result.conflict!,
            pending: state.pending.filter(
              (operation) => !confirmed.has(operation.id),
            ),
          }));
          this.emit("conflict");
          return;
        }
        const ids = new Set(batch.map((o) => o.id));
        if (
          !result.acknowledged ||
          result.acknowledged.length !== ids.size ||
          result.acknowledged.some((id) => !ids.has(id))
        )
          throw new Error("sync.failed");
        const acknowledged = new Set(result.acknowledged);
        await this.update((state) => ({
          ...state,
          head: result.head,
          records: result.records!,
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
      if (this.problem !== "sync.authentication") {
        this.problem = message.startsWith("sync.") ? message : "sync.failed";
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
      if (leased && useLease)
        await this.storage.release(this.scope, this.instance).catch(() => {});
      if (
        !this.disposed &&
        !this.state.conflict &&
        this.problem !== "sync.authentication" &&
        this.problem !== "sync.invalid"
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
      if (!this.state.pending.length && !this.problem && !this.state.conflict)
        return;
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
  async resolve(keepLocal: boolean) {
    await this.update((state) => {
      if (!state.conflict || !state.records) return state;
      const related = dependentIds(state.pending, state.conflict.id);
      if (!keepLocal)
        return {
          ...state,
          pending: state.pending.filter((o) => !related.has(o.id)),
          conflict: null,
        };
      let view = state.records;
      const pending = state.pending.map((operation) => {
        let next = operation;
        if (related.has(operation.id)) {
          let payload = structuredClone(operation.payload) as Record<
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
          if (operation.action === "attach-quick")
            payload.revision = view.sessions.find(
              (s) => s.id === payload.sessionId,
            )?.revision;
          next = operationSchema.parse({
            ...operation,
            id: crypto.randomUUID(),
            payload,
            base: targetsFor(operation.action, payload, view),
          });
        }
        view = related.has(operation.id)
          ? applyOperation(view, next)
          : project(view, [next]);
        return next;
      });
      return { ...state, pending, conflict: null };
    });
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
