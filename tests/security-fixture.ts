import { GitSecurityStore } from "../lib/auth/security-store";
import { DatabaseConflict, type GitDatabase } from "../lib/git-database/types";
export function securityFixture(clock = () => Math.floor(Date.now() / 1000)) {
  let head = 0;
  const files = new Map<string, string>();
  const db: GitDatabase = {
    async snapshot() {
      return { head: String(head), files: new Map(files) };
    },
    async publish(snapshot, entries) {
      if (snapshot.head !== String(head)) throw new DatabaseConflict();
      for (const entry of entries)
        for (const change of entry.changes) {
          if (change.content === null) files.delete(change.path);
          else files.set(change.path, change.content);
        }
      head++;
      return { head: String(head), commits: [String(head)] };
    },
  };
  return new GitSecurityStore(db, "security/test", "s".repeat(32), clock);
}
