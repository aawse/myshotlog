import "server-only";
import { cookies } from "next/headers";
import { verifySession, sessionCookie } from "./session";
import { oauthConfig } from "./github";
import { databaseConfigured } from "../git-database/config";
export { sessionCookie } from "./session";
export class AuthenticationRequired extends Error {
  constructor() {
    super("AUTH_REQUIRED");
  }
}
export function configured() {
  try {
    oauthConfig();
    return databaseConfigured();
  } catch {
    return false;
  }
}
export async function currentUser() {
  if (!configured()) return null;
  const config = oauthConfig();
  const token = (await cookies()).get(sessionCookie)?.value;
  const user = verifySession(
    token,
    config.secret,
    config.siteUrl,
    config.allowed,
    config.mapping,
  );
  return user;
}
export async function authenticated() {
  const user = await currentUser();
  if (!user) throw new AuthenticationRequired();
  return { user };
}
export async function endSession() {
  // Stateless logout clears this browser's cookie; it requires no database.
  (await cookies()).delete(sessionCookie);
}
