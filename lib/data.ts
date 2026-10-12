import "server-only";
import { cache } from "react";
import { authenticated } from "./auth/server";
import { database, databasePrefix } from "./git-database/config";
import { journalPrefix } from "./git-database/journal-prefix";
import { GitJournalStore } from "./git-database/store";
export async function journal() {
  const { user } = await authenticated();
  const provider = database();
  const prefix = await journalPrefix(
    provider,
    user.id,
    databasePrefix(),
    process.env.GIT_DATABASE_PREFIX !== undefined,
  );
  return new GitJournalStore(provider, user.id, prefix);
}
export const records = cache(async () => (await journal()).records());
