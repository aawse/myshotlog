import "server-only";
import { cache } from "react";
import { authenticated } from "./auth/server";
import { database, databasePrefix } from "./git-database/config";
import { GitJournalStore } from "./git-database/store";
export async function journal() {
  const { user } = await authenticated();
  return new GitJournalStore(database(), user.id, databasePrefix());
}
export const records = cache(async () => (await journal()).records());
