import "server-only";
import { createHash } from "node:crypto";
import { z } from "../validation";
import {
  GitJournalStore,
  InvalidRecord,
  RecordNotFound,
} from "../git-database/store";
import {
  DatabaseConflict,
  type GitDatabase,
  type GitSnapshot,
  type EntryCommit,
} from "../git-database/types";
import {
  canonical,
  normalizePayload,
  targetsFor,
  sameTargets,
  operationSchema,
  type Operation,
  type Target,
} from "./model";
export function browserScope(owner: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        owner,
        process.env.GIT_DATABASE_PROVIDER ?? "github",
        process.env.GIT_DATABASE_REPOSITORY,
        process.env.GIT_DATABASE_REMOTE,
        process.env.GIT_DATABASE_API_URL,
        process.env.GIT_DATABASE_BRANCH ?? "main",
        process.env.GIT_DATABASE_PREFIX ?? "auto",
      ]),
    )
    .digest("hex");
}
class StagedDatabase implements GitDatabase {
  readonly entries: EntryCommit[] = [];
  readonly files: Map<string, string>;
  constructor(private base: GitSnapshot) {
    this.files = new Map(base.files);
  }
  async snapshot(prefix: string) {
    return {
      head: this.base.head,
      files: new Map(
        [...this.files].filter(([p]) => p.startsWith(prefix + "/")),
      ),
    };
  }
  async publish(_snapshot: GitSnapshot, entries: EntryCommit[]) {
    for (const entry of entries)
      for (const change of entry.changes) {
        if (change.content === null) this.files.delete(change.path);
        else this.files.set(change.path, change.content);
      }
    this.entries.push(...entries);
    return { head: this.base.head, commits: [] };
  }
}
export class SyncConflict extends Error {
  constructor(
    public readonly operation: string,
    public readonly current: Target[],
    public readonly acknowledged: string[] = [],
  ) {
    super("conflict");
  }
}
export async function synchronize(
  provider: GitDatabase,
  owner: string,
  prefix: string,
  inputs: Operation[],
) {
  const operations = inputs.map((input) => operationSchema.parse(input));
  const path = prefix + "/users/" + z.uuid().parse(owner);
  const receiptPath = path + "/sync-receipts.json";
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = await provider.snapshot(path);
    const staged = new StagedDatabase(base),
      store = new GitJournalStore(staged, owner, prefix);
    const receipts = z
      .record(z.uuid(), z.string().regex(/^[a-f0-9]{64}$/))
      .parse(JSON.parse(base.files.get(receiptPath) ?? "{}"));
    const acknowledged: string[] = [];
    const confirmed: string[] = [];
    for (const operation of operations) {
      const digest = createHash("sha256")
        .update(canonical(operation))
        .digest("hex");
      if (receipts[operation.id]) {
        if (receipts[operation.id] !== digest)
          throw new InvalidRecord("sync.operationChanged");
        acknowledged.push(operation.id);
        confirmed.push(operation.id);
        continue;
      }
      const records = await store.records();
      const payload = normalizePayload(operation.action, operation.payload);
      const current = targetsFor(operation.action, payload, records);
      if (!sameTargets(operation.base, current))
        throw new SyncConflict(operation.id, current, confirmed);
      const before = staged.entries.length;
      try {
        await store.mutate(
          operation.action,
          payload,
          operation.photos,
          operation.recording,
        );
      } catch (error) {
        if (
          error instanceof DatabaseConflict ||
          error instanceof RecordNotFound
        )
          throw new SyncConflict(operation.id, current, confirmed);
        throw error;
      }
      receipts[operation.id] = digest;
      const receipt = {
        path: receiptPath,
        content: JSON.stringify(receipts) + "\n",
      };
      if (staged.entries.length === before)
        staged.entries.push({
          message: "MyShotLog: acknowledge operation " + operation.id,
          changes: [receipt],
        });
      else staged.entries[staged.entries.length - 1].changes.push(receipt);
      staged.files.set(receiptPath, receipt.content);
      acknowledged.push(operation.id);
    }
    try {
      const receipt = staged.entries.length
        ? await provider.publish(base, staged.entries)
        : { head: base.head, commits: [] };
      return {
        head: receipt.head,
        records: await store.records(),
        acknowledged,
      };
    } catch (error) {
      if (error instanceof DatabaseConflict && attempt < 2) continue;
      throw error;
    }
  }
  throw new DatabaseConflict();
}
