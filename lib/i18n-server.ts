import "server-only";
import { cache } from "react";
import { configured, currentUser } from "./auth/server";
import { records } from "./data";
import { translator } from "./i18n";
export const getI18n = cache(async () => {
  try {
    if (configured() && (await currentUser()))
      return translator((await records()).profile.language);
  } catch {
    /* Localization fallback never grants private access. */
  }
  return translator("sv");
});
