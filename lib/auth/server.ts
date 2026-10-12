import "server-only";
import { cookies } from "next/headers";
import { verifySession } from "./session";
import { securityStore } from "./security";
import { oauthConfig } from "./github";
import { databaseConfigured } from "../git-database/config";
export const sessionCookie = "skytte_session";
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
    config.allowed,
    config.mapping,
  );
  return user && token && (await securityStore().activeSession(token))
    ? user
    : null;
}
export async function authenticated() {
  const user = await currentUser();
  if (!user) throw new AuthenticationRequired();
  return { user };
}
export async function endSession() {
  const jar = await cookies(),
    token = jar.get(sessionCookie)?.value;
  if (token) {
    const config = oauthConfig();
    if (verifySession(token, config.secret, config.allowed, config.mapping))
      await securityStore().revokeSession(token);
  }
  jar.delete(sessionCookie);
}
