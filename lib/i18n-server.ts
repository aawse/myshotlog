import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { configured, currentUser } from "./auth/server";
import { browserScope } from "./sync/server";
import { translator } from "./i18n";
export const getI18n = cache(async () => {
  try {
    if (configured()) {
      const user = await currentUser();
      if (user) {
        const hint = (await cookies()).get("myshotlog_language")?.value;
        const scope = browserScope(user.id);
        if (hint === scope + ".en") return translator("en");
      }
    }
  } catch {
    /* Language never grants journal access. */
  }
  return translator("sv");
});
