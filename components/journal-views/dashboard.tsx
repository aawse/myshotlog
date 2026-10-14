"use client";
import { useI18n } from "@/components/language-provider";
import Link from "next/link";
import { sessionMedalCounts } from "@/lib/session-medals";
import {
  Plus,
  ArrowRight,
  CalendarDays,
  Crosshair,
  Target,
} from "lucide-react";
import { useRecords } from "@/components/journal-provider";
import { SessionList } from "@/components/session-list";
import { ImportData } from "@/components/import-data";
import { ProgressChart } from "@/components/progress-chart";
export default function View() {
  const { tr, locale } = useI18n();

  const data = useRecords();
  const now = new Intl.DateTimeFormat("sv-SE", {
    timeZone: data.profile.timezone,
  }).format(new Date());
  const monthly = data.sessions.filter((s) =>
    s.date.startsWith(now.slice(0, 7)),
  );
  const shots = data.sessions.reduce(
    (sum, s) => sum + s.results.reduce((n, r) => n + r.shots, 0),
    0,
  );
  return (
    <>
      {data.sessions.length === 0 &&
        data.firearms.length === 0 &&
        !data.quickEntries?.length && (
          <section className="card form">
            <h2>{tr("journal.emptyHeading")}</h2>
            <p>{tr("journal.emptyHelp")}</p>
            <ImportData returnToDashboard />
          </section>
        )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("dashboard.eyebrow")}</span>
          <h1>
            {data.profile.displayName
              ? tr("dashboard.hello") + data.profile.displayName + "."
              : tr("dashboard.welcome")}
          </h1>
          <p>{tr("dashboard.intro")}</p>
        </div>
        <Link className="button" href="/sessions/new/">
          <Plus size={18} /> {tr("session.register")}
        </Link>
      </div>
      <section className="hero-panel">
        <div>
          <span className="eyebrow">{tr("dashboard.focus")}</span>
          <h2>
            {tr("dashboard.heroFirst")}
            <br />
            {tr("dashboard.heroSecond")}
          </h2>
          <p>
            {tr("dashboard.heroIntroFirst")}
            <br />
            {tr("dashboard.heroIntroSecond")}
          </p>
          <Link href="/sessions/new/">
            {tr("dashboard.start")} <ArrowRight size={17} />
          </Link>
        </div>
        <div className="target-art" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <span>+</span>
        </div>
        <span className="hero-mark">{tr("dashboard.heroMark")}</span>
      </section>
      <div className="stats">
        <section className="card stat">
          <CalendarDays />
          <span>{tr("nav.sessions")}</span>
          <strong>{data.sessions.length}</strong>
          <small>
            {monthly.length} {tr("dashboard.thisMonth")}
          </small>
        </section>
        <section className="card stat">
          <Crosshair />
          <span>{tr("dashboard.shots")}</span>
          <strong>{shots.toLocaleString(locale)}</strong>
          <small>{tr("dashboard.allSessions")}</small>
        </section>
        <section className="card stat">
          <Target />
          <span>{tr("dashboard.activeFirearms")}</span>
          <strong>{data.firearms.filter((f) => !f.archived).length}</strong>
          <small>{tr("dashboard.archiveHelp")}</small>
        </section>
      </div>
      <div className="dashboard-grid">
        <ProgressChart sessions={data.sessions} />
        <section className="card qualification-teaser">
          <span className="eyebrow">{tr("nav.qualifications")}</span>
          <div className="medal-art" aria-hidden="true">
            ◎
          </div>
          <h2>
            {tr("dashboard.badgeFirst")}
            <br />
            {tr("dashboard.badgeSecond")}
          </h2>
          <p>{tr("dashboard.badgeHelp")}</p>
          <Link href="/qualifications/">
            {tr("dashboard.viewBadges")} <ArrowRight size={17} />
          </Link>
          <span className="muted">{tr("dashboard.personal")}</span>
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{tr("quick.atRange")}</span>
            <h2>{tr("dashboard.recent")}</h2>
          </div>
          <Link className="inline-link" href="/sessions/">
            {tr("dashboard.viewAll")} <ArrowRight size={16} />
          </Link>
        </div>
        <SessionList
          sessions={data.sessions.slice(0, 5)}
          medals={sessionMedalCounts(
            data.sessions.slice(0, 5),
            data.assessments,
          )}
          compact
        />
      </section>
    </>
  );
}
