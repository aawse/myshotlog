import {
  validPath,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "./types";
type Entry = { snapshot: GitSnapshot; expiresAt: number; bytes: number };
type Pending = { promise: Promise<GitSnapshot>; invalidated: boolean };
const copy = (snapshot: GitSnapshot): GitSnapshot => ({
  head: snapshot.head,
  files: new Map(snapshot.files),
});
// Only explicitly read-only operations use this cache. Transaction snapshots stay fresh.
export class ReadCachedDatabase implements GitDatabase {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Pending>();
  private bytes = 0;
  constructor(
    private source: GitDatabase,
    private ttlMs = 15000,
    private maxBytes = 32 * 1024 * 1024,
    private maxEntries = 64,
    private now = Date.now,
  ) {}
  snapshot(prefix: string) {
    return this.source.snapshot(prefix);
  }
  private remove(prefix: string) {
    const entry = this.entries.get(prefix);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(prefix);
  }
  async readSnapshot(prefix: string): Promise<GitSnapshot> {
    validPath(prefix);
    if (this.ttlMs <= 0) return this.source.snapshot(prefix);
    for (const [key, entry] of this.entries)
      if (entry.expiresAt <= this.now()) this.remove(key);
    const cached = this.entries.get(prefix);
    if (cached) {
      this.entries.delete(prefix);
      this.entries.set(prefix, cached);
      return copy(cached.snapshot);
    }
    const pending = this.pending.get(prefix);
    if (pending) return copy(await pending.promise);
    // Bound concurrent cache bookkeeping as well as retained snapshots.
    if (this.pending.size >= this.maxEntries)
      return this.source.snapshot(prefix);
    const load: Pending = {
      invalidated: false,
      promise: Promise.resolve().then(() => this.source.snapshot(prefix)),
    };
    this.pending.set(prefix, load);
    try {
      const snapshot = await load.promise;
      const bytes = [...snapshot.files].reduce(
        (size, [path, content]) =>
          size + Buffer.byteLength(path) + Buffer.byteLength(content),
        0,
      );
      if (!load.invalidated && bytes <= this.maxBytes && this.maxEntries > 0) {
        while (
          this.entries.size &&
          (this.entries.size >= this.maxEntries ||
            this.bytes + bytes > this.maxBytes)
        )
          this.remove(this.entries.keys().next().value!);
        this.entries.set(prefix, {
          snapshot: copy(snapshot),
          expiresAt: this.now() + this.ttlMs,
          bytes,
        });
        this.bytes += bytes;
      }
      return copy(snapshot);
    } finally {
      if (this.pending.get(prefix) === load) this.pending.delete(prefix);
    }
  }
  private invalidate(entries: EntryCommit[]) {
    const paths = entries.flatMap((entry) =>
      entry.changes.map((change) => change.path),
    );
    const affected = (prefix: string) =>
      paths.some((path) => path === prefix || path.startsWith(prefix + "/"));
    for (const prefix of this.entries.keys())
      if (affected(prefix)) this.remove(prefix);
    for (const [prefix, load] of this.pending)
      if (affected(prefix)) {
        load.invalidated = true;
        this.pending.delete(prefix);
      }
  }
  async publish(snapshot: GitSnapshot, entries: EntryCommit[]) {
    this.invalidate(entries);
    try {
      return await this.source.publish(snapshot, entries);
    } finally {
      // A read started during publication must not repopulate an older snapshot.
      // Failed/conflicting writes also discard affected entries before retry.
      this.invalidate(entries);
    }
  }
}
