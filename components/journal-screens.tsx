"use client";
import { lazy, Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useJournalState } from "./journal-provider";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import { ImportData } from "./import-data";
const loaders = {
  dashboard: () => import("./journal-views/dashboard"),
  sessions: () => import("./journal-views/sessions"),
  details: () => import("./journal-views/session-details"),
  edit: () => import("./journal-views/session-edit"),
  newSession: () => import("./journal-views/session-new"),
  firearms: () => import("./journal-views/firearms"),
  firearm: () => import("./journal-views/firearm-edit"),
  newFirearm: () => import("./journal-views/firearm-new"),
  quick: () => import("./journal-views/quick"),
  qualifications: () => import("./journal-views/qualifications"),
  settings: () => import("./journal-views/settings"),
};
const Dashboard = lazy(loaders.dashboard),
  Sessions = lazy(loaders.sessions),
  Details = lazy(loaders.details),
  Edit = lazy(loaders.edit),
  NewSession = lazy(loaders.newSession),
  Firearms = lazy(loaders.firearms),
  Firearm = lazy(loaders.firearm),
  NewFirearm = lazy(loaders.newFirearm),
  Quick = lazy(loaders.quick),
  Qualifications = lazy(loaders.qualifications),
  Settings = lazy(loaders.settings);
export function JournalScreens({ fallback }: { fallback: React.ReactNode }) {
  const path = (usePathname() ?? "").replace(/\/$/, ""),
    query = useSearchParams();
  const { records, status } = useJournalState(),
    { tr } = useI18n();
  useEffect(() => {
    // Preload code, never personal data, for navigation while the open app is offline.
    const timer = setTimeout(() => {
      void Promise.allSettled(Object.values(loaders).map((load) => load()));
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  const loading = (
    <div className="card">
      <LoadingIndicator label={tr("loading.journal")} />
    </div>
  );
  if (status === "authentication")
    return (
      <section className="card">
        <p>{tr("sync.authentication")}</p>
        <a className="button" href="/login/">
          {tr("login.return")}
        </a>
      </section>
    );
  if (path !== "/settings" && !records)
    return status === "loading" || status === "syncing" ? (
      loading
    ) : (
      <section className="card">
        <h1>{tr("error.loadHeading")}</h1>
        <p>{tr("error.loadHelp")}</p>
        <ImportData returnToDashboard />
      </section>
    );
  let view: React.ReactNode = fallback;
  if (path === "/dashboard") view = <Dashboard />;
  else if (path === "/sessions") view = <Sessions />;
  else if (path === "/sessions/new")
    view = <NewSession quick={query.get("quick") ?? undefined} />;
  else if (path === "/firearms") view = <Firearms />;
  else if (path === "/firearms/new") view = <NewFirearm />;
  else if (path === "/quick") view = <Quick />;
  else if (path === "/settings") view = <Settings />;
  else if (path === "/qualifications")
    view = (
      <Qualifications
        q={{
          year: query.get("year") ?? undefined,
          group: query.get("group") ?? undefined,
        }}
      />
    );
  else {
    const session = path.match(/^\/sessions\/([0-9a-f-]+)(\/edit)?$/i),
      firearm = path.match(/^\/firearms\/([0-9a-f-]+)$/i);
    if (session)
      view = session[2] ? (
        <Edit key={session[1]} id={session[1]} />
      ) : (
        <Details key={session[1]} id={session[1]} />
      );
    else if (firearm) view = <Firearm key={firearm[1]} id={firearm[1]} />;
  }
  return <Suspense fallback={loading}>{view}</Suspense>;
}
