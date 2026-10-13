import "server-only";
import { database, databasePrefix } from "../git-database/config";
import { journalPrefix } from "../git-database/journal-prefix";
import { oauthConfig } from "../auth/github";
import { journalOwner } from "../auth/session";
import { WitnessStore, WitnessUnavailable, witnessClaims } from "./store";
export async function ownerWitnessStore(user: {
  id: string;
  githubId: string;
}) {
  const config = oauthConfig(),
    db = database();
  const prefix = await journalPrefix(
    db,
    user.id,
    databasePrefix(),
    process.env.GIT_DATABASE_PREFIX !== undefined,
  );
  return new WitnessStore(
    db,
    user.id,
    prefix,
    config.secret,
    config.siteUrl,
    user.githubId,
  );
}
export function anonymousWitnessStore(token: string) {
  const config = oauthConfig();
  const claims = witnessClaims(token, config.secret, config.siteUrl);
  if (
    !config.allowed.includes(claims.githubId) ||
    journalOwner(claims.githubId, config.mapping) !== claims.ownerId ||
    (claims.prefix !== databasePrefix() &&
      (process.env.GIT_DATABASE_PREFIX !== undefined ||
        claims.prefix !== "skytte/v1"))
  )
    throw new WitnessUnavailable();
  return new WitnessStore(
    database(),
    claims.ownerId,
    claims.prefix,
    config.secret,
    config.siteUrl,
    claims.githubId,
  );
}
