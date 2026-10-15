import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { database, databasePrefix } from "../git-database/config";
import { oauthConfig } from "./github";
import { GitSecurityStore } from "./security-store";
let cached: { key: string; store: GitSecurityStore } | undefined;
export function securityStore() {
  const config = oauthConfig();
  // Namespace security state by origin and random signing key, not a user password.
  // Keep the existing digest to preserve pending OAuth flows and shared rate limits.
  const scope = createHash("sha256")
    .update(config.siteUrl + "\0" + config.secret)
    .digest("hex");
  const prefix = databasePrefix() + "/security/" + scope;
  const key = [
    prefix,
    process.env.GIT_DATABASE_PROVIDER,
    process.env.GIT_DATABASE_REPOSITORY,
    process.env.GIT_DATABASE_REMOTE,
    process.env.GIT_DATABASE_BRANCH,
    process.env.GIT_DATABASE_TOKEN,
    process.env.GIT_DATABASE_API_URL,
  ].join("\0");
  if (!cached || cached.key !== key)
    cached = {
      key,
      store: new GitSecurityStore(database(), prefix, config.secret),
    };
  return cached.store;
}
export function clientAddress(request: Request) {
  // A self-hosted proxy must replace this header; direct-client forwarding headers are untrusted.
  const header =
    process.env.VERCEL === "1"
      ? "x-vercel-forwarded-for"
      : process.env.AUTH_TRUSTED_IP_HEADER;
  const value = header ? request.headers.get(header)?.trim() : undefined;
  return value && isIP(value) ? value : "shared";
}
