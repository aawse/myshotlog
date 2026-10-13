const staticRoutes = new Set([
  "/",
  "/login/",
  "/setup/",
  "/dashboard/",
  "/sessions/",
  "/sessions/new/",
  "/firearms/",
  "/firearms/new/",
  "/settings/",
  "/qualifications/",
  "/quick/",
]);

export function redactPerformanceEvent(
  event: { type: "vital"; url: string; route?: string },
  origin: string,
): { type: "vital"; url: string; route: string } | null {
  try {
    const url = new URL(event.url);
    if (url.origin !== origin || url.username || url.password) return null;
    const path = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
    let route: string;
    if (staticRoutes.has(path)) route = path;
    else if (/^\/sessions\/[^/]+\/edit\/$/.test(path))
      route = "/sessions/[id]/edit/";
    else if (/^\/sessions\/[^/]+\/$/.test(path)) route = "/sessions/[id]/";
    else if (/^\/firearms\/[^/]+\/$/.test(path)) route = "/firearms/[id]/";
    else return null;
    // Report page categories only: never query strings, fragments or journal IDs.
    return { type: "vital", url: origin + route, route };
  } catch {
    return null;
  }
}
