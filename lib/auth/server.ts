import "server-only";
import { cookies } from "next/headers";
import { verifySession } from "./session";
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
  return verifySession(
    (await cookies()).get(sessionCookie)?.value,
    config.secret,
    config.allowed,
    config.mapping,
  );
}
export async function authenticated() {
  const user = await currentUser();
  if (!user) throw new AuthenticationRequired();
  return { user };
}
export async function endSession() {
  (await cookies()).delete(sessionCookie);
}
