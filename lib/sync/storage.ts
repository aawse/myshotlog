import { z } from "../validation";
import {
  recordsSchema,
  operationSchema,
  headSchema,
  targetSchema,
  type Operation,
} from "./model";
export const stateSchema = z
  .object({
    version: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    head: headSchema,
    records: recordsSchema.nullable(),
    pending: z.array(operationSchema).max(200),
    syncedAt: z.iso.datetime().nullable(),
    photos: z.record(
      z.string().regex(/^[a-f0-9]{64}$/),
      z
        .string()
        .max(250000)
        .regex(/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
    ),
    conflict: z
      .object({ id: z.uuid(), current: z.array(targetSchema).max(101) })
      .strict()
      .nullable(),
  })
  .strict();
export type BrowserState = z.infer<typeof stateSchema>;
export function initialState(scope: string): BrowserState {
  return {
    version: 1,
    scope,
    head: null,
    records: null,
    pending: [],
    syncedAt: null,
    photos: {},
    conflict: null,
  };
}
export interface BrowserStorage {
  load(scope: string): Promise<BrowserState>;
  update(
    scope: string,
    change: (state: BrowserState) => BrowserState,
  ): Promise<BrowserState>;
  claim(scope: string, owner: string, now: number): Promise<boolean>;
  release(scope: string, owner: string): Promise<void>;
}
export const MAX_LOCAL_BYTES = 32 * 1024 * 1024;
export function validateState(value: unknown, scope: string): BrowserState {
  const state = stateSchema.parse(value);
  if (
    state.scope !== scope ||
    new Set(state.pending.map((o) => o.id)).size !== state.pending.length ||
    new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_LOCAL_BYTES
  )
    throw new Error("sync.storageError");
  return state;
}
export class IndexedBrowserStorage implements BrowserStorage {
  private opening?: Promise<IDBDatabase>;
  private database() {
    return (this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("myshotlog-browser", 1);
      let finished = false;
      const timer = setTimeout(() => {
        finished = true;
        this.opening = undefined;
        reject(new Error("sync.storageError"));
      }, 5000);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("journals");
        db.createObjectStore("leases");
      };
      request.onerror = () => {
        clearTimeout(timer);
        this.opening = undefined;
        reject(new Error("sync.storageError"));
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        const db = request.result;
        if (finished) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.opening = undefined;
        };
        resolve(db);
      };
    }));
  }
  private async transaction<T>(
    table: string,
    mode: IDBTransactionMode,
    key: string,
    change?: (value: unknown) => unknown,
  ): Promise<T> {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(table, mode),
        store = tx.objectStore(table),
        request = store.get(key);
      let result: unknown;
      let failure: Error | undefined;
      const timer = setTimeout(() => {
        tx.abort();
      }, 5000);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(result as T);
      };
      tx.onabort = tx.onerror = () => {
        clearTimeout(timer);
        reject(failure ?? new Error("sync.storageError"));
      };
      request.onsuccess = () => {
        try {
          result = change ? change(request.result) : request.result;
          if (change) store.put(result, key);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("sync."))
            failure = error;
          tx.abort();
        }
      };
    });
  }
  async load(scope: string) {
    const value = await this.transaction<unknown>(
      "journals",
      "readonly",
      scope,
    );
    return value === undefined
      ? initialState(scope)
      : validateState(value, scope);
  }
  async update(scope: string, change: (state: BrowserState) => BrowserState) {
    return this.transaction<BrowserState>(
      "journals",
      "readwrite",
      scope,
      (value) =>
        validateState(
          change(
            value === undefined
              ? initialState(scope)
              : validateState(value, scope),
          ),
          scope,
        ),
    );
  }
  async claim(scope: string, owner: string, now: number) {
    const value = await this.transaction<{ owner: string; until: number }>(
      "leases",
      "readwrite",
      scope,
      (value) => {
        const lease = value as { owner: string; until: number } | undefined;
        return !lease || lease.until <= now || lease.owner === owner
          ? { owner, until: now + 120000 }
          : lease;
      },
    );
    return value.owner === owner;
  }
  async release(scope: string, owner: string) {
    await this.transaction("leases", "readwrite", scope, (value) => {
      const lease = value as { owner: string; until: number } | undefined;
      return lease?.owner === owner ? { owner: "", until: 0 } : lease;
    });
  }
}
export function pendingBatch(operations: Operation[]): Operation[] {
  const batch: Operation[] = [];
  for (const operation of operations.slice(0, 20)) {
    if (
      new TextEncoder().encode(JSON.stringify([...batch, operation]))
        .byteLength > 2700000
    )
      break;
    batch.push(operation);
  }
  if (operations.length && !batch.length) throw new Error("sync.queueFull");
  return batch;
}
export function affectedBy(operation: Operation, earlier: Operation) {
  return operation.base.some((a) =>
    earlier.base.some((b) => a.kind === b.kind && a.id === b.id),
  );
}
export function dependentIds(operations: Operation[], id: string) {
  const selected: Operation[] = [];
  for (const operation of operations)
    if (
      operation.id === id ||
      selected.some((prior) => affectedBy(operation, prior))
    )
      selected.push(operation);
  return new Set(selected.map((o) => o.id));
}

/** Keep recent referenced photos, while never evicting photos used by pending saves. */
export function prunePhotos(state: BrowserState): BrowserState {
  const live = new Set<string>(),
    pending = new Set<string>();
  for (const result of [
    ...(state.records?.sessions ?? []).flatMap((session) => session.results),
    ...(state.records?.quickEntries ?? []).map((entry) => entry.result),
  ])
    if (result.photoId) live.add(result.photoId);
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "photoId" && typeof child === "string") pending.add(child);
      else visit(child);
    }
  };
  state.pending.forEach((operation) => visit(operation.payload));
  const entries = Object.entries(state.photos).filter(
    ([id]) => live.has(id) || pending.has(id),
  );
  const recent = entries.filter(([id]) => !pending.has(id)).slice(-64);
  return {
    ...state,
    photos: Object.fromEntries([
      ...recent,
      ...entries.filter(([id]) => pending.has(id)),
    ]),
  };
}
