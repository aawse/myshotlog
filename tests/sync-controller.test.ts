import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserJournal } from "../lib/sync/controller";
import {
  initialState,
  validateState,
  pendingBatch,
  dependentIds,
  prunePhotos,
  type BrowserStorage,
  type BrowserState,
} from "../lib/sync/storage";
import {
  emptyRecords,
  applyOperation,
  targetsFor,
  canonical,
  type Operation,
} from "../lib/sync/model";
import { profile, firearm, session } from "./fixtures";
const scope = "b".repeat(64),
  head = "a".repeat(40);
class MemoryStorage implements BrowserStorage {
  state: BrowserState = {
    ...initialState(scope),
    records: emptyRecords(),
    head,
  };
  failure = false;
  lease = "";
  until = 0;
  async load() {
    return structuredClone(this.state);
  }
  async update(_scope: string, change: (state: BrowserState) => BrowserState) {
    if (this.failure) throw new Error("sync.storageError");
    const next = validateState(change(structuredClone(this.state)), scope);
    this.state = structuredClone(next);
    return structuredClone(next);
  }
  async claim(_scope: string, owner: string, now: number) {
    if (this.lease && this.lease !== owner && this.until > now) return false;
    this.lease = owner;
    this.until = now + 120000;
    return true;
  }
  async release(_scope: string, owner: string) {
    if (this.lease === owner) {
      this.lease = "";
      this.until = 0;
    }
  }
}
const engines: BrowserJournal[] = [];
beforeEach(() => vi.stubGlobal("BroadcastChannel", undefined));
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  vi.unstubAllGlobals();
});
function engine(
  storage: MemoryStorage,
  request: typeof fetch,
  online: () => boolean = () => true,
) {
  const journal = new BrowserJournal(scope, storage, request, online);
  engines.push(journal);
  return journal;
}
function server(storage: MemoryStorage) {
  let records = structuredClone(storage.state.records!),
    current = head;
  const received: Operation[][] = [];
  return {
    received,
    request: vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.method !== "POST")
        return Response.json({
          scope,
          head: current,
          records,
          unchanged: false,
        });
      const batch = JSON.parse(String(options.body)).operations as Operation[];
      received.push(batch);
      for (const operation of batch)
        records = applyOperation(records, operation);
      current = "c".repeat(40);
      return Response.json({
        scope,
        head: current,
        records,
        acknowledged: batch.map((o) => o.id),
      });
    }),
  };
}
it("acknowledges local saves only after durable storage and sends no request while offline", async () => {
  const storage = new MemoryStorage(),
    remote = server(storage),
    journal = engine(storage, remote.request, () => false);
  await journal.start();
  expect(await journal.enqueue("firearm", firearm)).toMatchObject({
    queued: true,
  });
  expect(remote.request).not.toHaveBeenCalled();
  expect(storage.state.pending).toHaveLength(1);
  expect(journal.getSnapshot().records?.firearms[0]).toEqual(firearm);
  storage.failure = true;
  await expect(journal.enqueue("profile", profile)).rejects.toThrow(
    "sync.storageError",
  );
  expect(storage.state.pending).toHaveLength(1);
});
it("restores pending changes after reopening and batches them into one request", async () => {
  const storage = new MemoryStorage(),
    remote = server(storage),
    first = engine(storage, remote.request, () => false);
  await first.start();
  await first.enqueue("firearm", firearm);
  await first.enqueue("session", session);
  first.dispose();
  const next = engine(storage, remote.request);
  await next.start();
  expect(remote.received).toHaveLength(1);
  expect(remote.received[0]).toHaveLength(2);
  expect(storage.state.pending).toEqual([]);
  expect(next.getSnapshot().records?.sessions).toHaveLength(1);
});
it("checks only the head when the remote snapshot is unchanged", async () => {
  const storage = new MemoryStorage(),
    request = vi.fn(async (_url: RequestInfo | URL) =>
      Response.json({ scope, head, unchanged: true }),
    ),
    journal = engine(storage, request);
  await journal.start();
  expect(request).toHaveBeenCalledTimes(1);
  expect(String(request.mock.calls[0]?.[0])).toContain("head=" + head);
  expect(journal.getSnapshot().records).toEqual(storage.state.records);
});
it("retains all pending changes after a failed or ambiguous response", async () => {
  const storage = new MemoryStorage();
  let online = false;
  const request = vi.fn(
    async (_url: RequestInfo | URL, options?: RequestInit) =>
      options?.method === "POST"
        ? Response.json({ error: "unavailable" }, { status: 503 })
        : Response.json({ scope, head, unchanged: true }),
  );
  const journal = engine(storage, request, () => online);
  await journal.start();
  await journal.enqueue("firearm", firearm);
  const queued = structuredClone(storage.state.pending);
  online = true;
  await journal.sync();
  expect(storage.state.pending).toEqual(queued);
  expect(journal.getSnapshot().status).toBe("error");
});
it("never discards operations on an incorrect acknowledgement", async () => {
  const storage = new MemoryStorage();
  let online = false;
  const request = vi.fn(
    async (_url: RequestInfo | URL, options?: RequestInit) =>
      Response.json(
        options?.method === "POST"
          ? {
              scope,
              head,
              records: emptyRecords(),
              acknowledged: [crypto.randomUUID()],
            }
          : { scope, head, unchanged: true },
      ),
  );
  const journal = engine(storage, request, () => online);
  await journal.start();
  await journal.enqueue("firearm", firearm);
  online = true;
  await journal.sync();
  expect(storage.state.pending).toHaveLength(1);
  expect(journal.getSnapshot().status).toBe("error");
});
it("keeps a save added during a network request instead of clearing the whole queue", async () => {
  const storage = new MemoryStorage();
  let online = false,
    release!: () => void;
  const request = vi.fn(
    async (_url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.method !== "POST")
        return Response.json({ scope, head, unchanged: true });
      const operations = JSON.parse(String(options.body))
        .operations as Operation[];
      await new Promise<void>((resolve) => (release = resolve));
      return Response.json({
        scope,
        head: "c".repeat(40),
        records: applyOperation(emptyRecords(), operations[0]),
        acknowledged: operations.map((o) => o.id),
      });
    },
  );
  const journal = engine(storage, request, () => online);
  await journal.start();
  await journal.enqueue("firearm", firearm);
  online = true;
  const sync = journal.sync();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await journal.enqueue("profile", profile);
  release();
  await sync;
  expect(storage.state.pending).toHaveLength(1);
  expect(storage.state.pending[0].action).toBe("profile");
  expect(journal.getSnapshot().records?.profile.displayName).toBe(
    profile.displayName,
  );
});
it("captures birth information when locally saved, before a later profile correction", async () => {
  const storage = new MemoryStorage();
  storage.state.records = { ...emptyRecords(), profile, firearms: [firearm] };
  const remote = server(storage),
    journal = engine(storage, remote.request, () => false);
  await journal.start();
  await journal.enqueue("session", session);
  await journal.enqueue("profile", {
    ...profile,
    birthDate: "1960-01-01",
    birthYear: 1960,
  });
  expect(storage.state.pending[0].recording.birthYear).toBe(1990);
  expect(journal.getSnapshot().records?.assessments[0].input).toMatchObject({
    birthYear: 1990,
  });
});
it("retains both versions on conflict and rebases only after the user chooses the device version", async () => {
  const storage = new MemoryStorage();
  storage.state.records = { ...emptyRecords(), firearms: [firearm] };
  let online = false,
    conflict = true;
  const remote = {
    ...emptyRecords(),
    firearms: [{ ...firearm, model: "Remote" }],
  };
  const request = vi.fn(
    async (_url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.method !== "POST")
        return Response.json({ scope, head, unchanged: true });
      const operations = JSON.parse(String(options.body))
        .operations as Operation[];
      if (conflict)
        return Response.json(
          {
            scope,
            head: "c".repeat(40),
            records: remote,
            conflict: {
              id: operations[0].id,
              current: targetsFor(
                operations[0].action,
                operations[0].payload,
                remote,
              ),
            },
          },
          { status: 409 },
        );
      return Response.json({
        scope,
        head: "d".repeat(40),
        records: applyOperation(remote, operations[0]),
        acknowledged: operations.map((o) => o.id),
      });
    },
  );
  const journal = engine(storage, request, () => online);
  await journal.start();
  await journal.enqueue("firearm", { ...firearm, model: "Local" });
  online = true;
  await journal.sync();
  expect(journal.getSnapshot().status).toBe("conflict");
  expect(storage.state.records?.firearms[0].model).toBe("Remote");
  expect(journal.getSnapshot().records?.firearms[0].model).toBe("Local");
  const oldId = storage.state.pending[0].id;
  await journal.resolve(true);
  expect(storage.state.pending[0].id).not.toBe(oldId);
  expect(storage.state.pending[0].base[0].value).toMatchObject({
    model: "Remote",
  });
  conflict = false;
  await journal.sync();
  expect(storage.state.pending).toEqual([]);
  expect(storage.state.records?.firearms[0].model).toBe("Local");
});
it("discards dependent edits together only when the user chooses the server version", async () => {
  const storage = new MemoryStorage(),
    remote = server(storage),
    journal = engine(storage, remote.request, () => false);
  await journal.start();
  await journal.enqueue("firearm", firearm);
  await journal.enqueue("firearm", { ...firearm, model: "Later" });
  await journal.enqueue("profile", profile);
  const id = storage.state.pending[0].id;
  expect(dependentIds(storage.state.pending, id).size).toBe(2);
  await storage.update(scope, (s) => ({ ...s, conflict: { id, current: [] } }));
  await journal.reload();
  await journal.resolve(false);
  expect(storage.state.pending.map((o) => o.action)).toEqual(["profile"]);
});
it("restores a scoped backup idempotently and rejects a different repository/account", async () => {
  const storage = new MemoryStorage(),
    remote = server(storage),
    journal = engine(storage, remote.request, () => false);
  await journal.start();
  await journal.enqueue("firearm", firearm);
  const backup = {
    format: "myshotlog-pending",
    version: 1,
    scope,
    operations: storage.state.pending,
    photos: {},
  };
  await journal.restore(backup);
  expect(storage.state.pending).toHaveLength(1);
  await expect(
    journal.restore({ ...backup, scope: "c".repeat(64) }),
  ).rejects.toThrow();
  expect(storage.state.pending).toHaveLength(1);
});
it("keeps queued edits after authentication expiry and prevents new saves until reauthenticated", async () => {
  const storage = new MemoryStorage();
  let online = false;
  const request = vi.fn(async () =>
    Response.json({ error: "authentication" }, { status: 401 }),
  );
  const journal = engine(storage, request, () => online);
  await journal.start();
  await journal.enqueue("firearm", firearm);
  online = true;
  await journal.sync();
  expect(journal.getSnapshot().status).toBe("authentication");
  expect(storage.state.pending).toHaveLength(1);
  await expect(journal.enqueue("profile", profile)).rejects.toThrow(
    "sync.authentication",
  );
});
it("coordinates two engines through an atomic lease and never overlaps their network batches", async () => {
  const storage = new MemoryStorage();
  let online = false,
    release!: () => void,
    posts = 0;
  const remote = server(storage);
  const request = vi.fn(
    async (url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.method === "POST") {
        posts++;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return remote.request(url, options);
    },
  );
  const a = engine(storage, request, () => online),
    b = engine(storage, request, () => online);
  await a.start();
  await b.start();
  await a.enqueue("firearm", firearm);
  online = true;
  const first = a.sync();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await b.sync();
  expect(posts).toBe(1);
  release();
  await first;
  expect(storage.state.pending).toEqual([]);
});
it("splits batches by both operation count and request byte limits", () => {
  const base: Operation = {
    id: crypto.randomUUID(),
    action: "profile",
    payload: emptyRecords().profile,
    base: targetsFor("profile", emptyRecords().profile, emptyRecords()),
    photos: [],
    recording: {
      recordedAt: "2026-10-14T12:00:00Z",
      birthDate: null,
      birthYear: null,
    },
  };
  expect(
    pendingBatch(
      Array.from({ length: 30 }, () => ({ ...base, id: crypto.randomUUID() })),
    ),
  ).toHaveLength(20);
  const large = {
    ...base,
    photos: [{ id: crypto.randomUUID(), data: "A".repeat(1000000) }],
  };
  expect(pendingBatch([large, large, large])).toHaveLength(2);
  expect(() =>
    validateState({ ...initialState(scope), scope: "c".repeat(64) }, scope),
  ).toThrow();
  expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
});

it("calls the native browser fetch through globalThis rather than binding it to the controller", async () => {
  const storage = new MemoryStorage();
  const request = vi.fn(function (this: unknown) {
    expect(this).toBe(globalThis);
    return Promise.resolve(Response.json({ scope, head, unchanged: true }));
  });
  vi.stubGlobal("fetch", request);
  const journal = new BrowserJournal(scope, storage, undefined, () => true);
  engines.push(journal);
  await journal.start();
  expect(request).toHaveBeenCalledTimes(1);
  expect(journal.getSnapshot().status).toBe("synced");
});

it("bounds viewed-photo caches without evicting pending images and removes deleted-record photos", () => {
  const photos = Object.fromEntries(
    Array.from({ length: 70 }, (_, index) => [
      index.toString(16).padStart(64, "0"),
      "data:image/jpeg;base64,AAAA",
    ]),
  );
  const base = {
    ...initialState(scope),
    records: {
      ...emptyRecords(),
      sessions: [
        {
          ...session,
          results: Object.keys(photos).map((id) => ({
            ...session.results[0],
            id: crypto.randomUUID(),
            photoId: id,
          })),
        },
      ],
    },
    photos,
  };
  expect(Object.keys(prunePhotos(base).photos)).toHaveLength(64);
  const operation = {
    id: crypto.randomUUID(),
    action: "session" as const,
    payload: {
      ...session,
      results: [{ ...session.results[0], photoId: Object.keys(photos)[0] }],
    },
    photos: [],
    recording: {
      recordedAt: "2026-10-14T12:00:00Z",
      birthDate: null,
      birthYear: null,
    },
    base: targetsFor("session", session, emptyRecords()),
  };
  expect(prunePhotos({ ...base, pending: [operation] }).photos).toHaveProperty(
    Object.keys(photos)[0],
  );
  expect(prunePhotos({ ...base, records: emptyRecords() }).photos).toEqual({});
});
