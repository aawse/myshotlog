"use client";
import { useRouter } from "next/navigation";
import { useJournal } from "./journal-provider";
export function journalPath(path: string) {
  return /^\/(?:dashboard|quick|training|settings|qualifications|sessions(?:\/[0-9a-f-]+(?:\/edit)?|\/new)?|firearms(?:\/[0-9a-f-]+|\/new)?)\/?$/i.test(
    path,
  );
}
export function navigateJournal(url: string, replace = false) {
  const target = new URL(url, location.origin);
  if (target.origin !== location.origin || !journalPath(target.pathname))
    return false;
  window.history[replace ? "replaceState" : "pushState"](
    null,
    "",
    target.pathname + target.search + target.hash,
  );
  window.scrollTo({ top: 0 });
  return true;
}
export function useJournalRouter() {
  const router = useRouter(),
    journal = useJournal();
  return journal
    ? {
        push: (url: string) => {
          if (!navigateJournal(url)) router.push(url);
        },
        replace: (url: string) => {
          if (!navigateJournal(url, true)) router.replace(url);
        },
        refresh: () => {},
      }
    : router;
}
