"use client";
import { useI18n } from "@/components/language-provider";
import Link from "next/link";
import { sessionMedalCounts } from "@/lib/session-medals";
import { useRecords } from "@/components/journal-provider";
import { SessionList } from "@/components/session-list";
import { ImportData } from "@/components/import-data";
import { ProgressChart } from "@/components/progress-chart";
import { RedesignIcon } from "@/components/redesign-icon";
import { disciplineName } from "@/lib/i18n-domain";
import { discipline } from "@/lib/disciplines";
import { todayInTimezone } from "@/lib/models";
import { sessionDisplayConditions } from "@/lib/session-conditions";
import { summarize } from "@/lib/rules/engine";

export default function View({ progress = false }: { progress?: boolean }) {
  const { tr, language, locale } = useI18n();
  const data = useRecords();
  if (progress)
    return (
      <>
        <h1>{tr("nav.progress")}</h1>
        <ProgressChart sessions={data.sessions} />
      </>
    );
  const today = todayInTimezone(data.profile.timezone);
  const monthly = data.sessions.filter((session) =>
    session.date.startsWith(today.slice(0, 7)),
  );
  const shots = monthly.reduce(
    (sum, session) => sum + summarize(session).shots,
    0,
  );
  const month = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(today + "T12:00:00Z"));
  const recent = data.sessions.slice(0, 3);
  const latest = recent[0];
  const total = latest && summarize(latest);
  const distance = latest && sessionDisplayConditions(latest).distance;
  const average =
    latest && total?.shots && discipline(latest.discipline).kind === "points"
      ? new Intl.NumberFormat(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(total.points / latest.results.length)
      : undefined;
  return (
    <div className="journal-dashboard">
      <div className="page-heading journal-heading">
        <div>
          <h1>
            {tr(
              data.sessions.length ||
                data.firearms.length ||
                data.quickEntries?.length
                ? "sessions.eyebrow"
                : "dashboard.welcome",
            )}
          </h1>
          <p>
            {data.profile.displayName
              ? tr("dashboard.hello") + data.profile.displayName + "."
              : tr("dashboard.intro")}
          </p>
        </div>
        <div className="actions journal-heading-actions">
          <Link className="button secondary journal-quick" href="/quick/">
            <RedesignIcon name="plus" /> {tr("nav.quick")}
          </Link>
          <Link className="button journal-new" href="/sessions/new/">
            <RedesignIcon name="plus-light" /> {tr("session.register")}
          </Link>
        </div>
      </div>
      <div className="stats journal-stats">
        <section className="stat">
          <span>{tr("nav.sessions")}</span>
          <strong>{monthly.length.toLocaleString(locale)}</strong>
          <small>{month}</small>
        </section>
        <section className="stat">
          <span>{tr("dashboard.shots")}</span>
          <strong>{shots.toLocaleString(locale)}</strong>
          <small>{tr("dashboard.thisMonth")}</small>
        </section>
        <section className="stat">
          <span>{tr("dashboard.activeFirearms")}</span>
          <strong>
            {data.firearms
              .filter((firearm) => !firearm.archived)
              .length.toLocaleString(locale)}
          </strong>
          <Link className="inline-link" href="/firearms/">
            {tr("nav.firearms")}
          </Link>
        </section>
      </div>
      {!data.sessions.length &&
        !data.firearms.length &&
        !data.quickEntries?.length && (
          <section className="card form">
            <h2>{tr("journal.emptyHeading")}</h2>
            <p>{tr("journal.emptyHelp")}</p>
            <ImportData returnToDashboard />
          </section>
        )}
      <section className="dashboard-grid journal-overview">
        <div id="progress">
          <ProgressChart sessions={data.sessions} compact />
        </div>
        {latest && total && (
          <Link className="journal-latest" href={`/sessions/${latest.id}/`}>
            <time dateTime={latest.date}>
              {new Intl.DateTimeFormat(locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(new Date(latest.date + "T12:00:00Z"))}
            </time>
            <h2>{disciplineName(language, latest.discipline)}</h2>
            <span>
              {latest.location || tr("common.noLocation")}
              {distance != null && ` · ${distance} m`}
            </span>
            {average !== undefined && (
              <div className="journal-average">
                <strong>{average}</strong> {tr("dashboard.average")}
              </div>
            )}
            <span>
              {tr("common.seriesCount", { count: latest.results.length })} ·{" "}
              {total.shots} {tr("session.shots")}
            </span>
            <span className="journal-open">
              {tr("sessions.open")} <RedesignIcon name="chevron-light" />
            </span>
          </Link>
        )}
      </section>
      <section className="journal-recent">
        <div className="section-heading">
          <h2>{tr("dashboard.recent")}</h2>
          <Link className="inline-link" href="/sessions/">
            {tr("dashboard.viewAll")} <RedesignIcon name="chevron" />
          </Link>
        </div>
        <SessionList
          sessions={recent}
          medals={sessionMedalCounts(recent, data.assessments)}
          compact
        />
      </section>
      <Link className="button journal-mobile-quick" href="/quick/">
        <RedesignIcon name="plus-light" /> {tr("nav.quick")}
      </Link>
    </div>
  );
}
