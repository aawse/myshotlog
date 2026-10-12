import type { GitDatabase } from "./types";
// Compatibility for journals created before the MyShotLog default was introduced.
const legacyPrefix = "skytte/v1";
export async function journalPrefix(
  provider: GitDatabase,
  owner: string,
  prefix: string,
  explicitlyConfigured: boolean,
) {
  if (explicitlyConfigured) return prefix;
  const read =
    provider.readSnapshot?.bind(provider) ?? provider.snapshot.bind(provider);
  const current = await read(prefix + "/users/" + owner);
  if (current.files.size) return prefix;
  const legacy = await read(legacyPrefix + "/users/" + owner);
  return legacy.files.size ? legacyPrefix : prefix;
}
