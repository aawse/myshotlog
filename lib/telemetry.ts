import type { BeforeSendEvent } from "@vercel/analytics/next";
export function filterAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    if (url.pathname === "/witness" || url.pathname.startsWith("/witness/"))
      return null;
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
