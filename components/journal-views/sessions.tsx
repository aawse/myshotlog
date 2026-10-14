"use client";
import { useI18n } from "@/components/language-provider";
import Link from "next/link";
import { sessionMedalCounts } from "@/lib/session-medals";
import { useRecords } from "@/components/journal-provider";
import { SessionList } from "@/components/session-list";
export default function View() {
  const { tr } = useI18n();

  const data = useRecords();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("sessions.eyebrow")}</span>
          <h1>{tr("nav.sessions")}</h1>
          <p>{tr("sessions.intro")}</p>
        </div>
        <div className="actions">
          <Link className="button secondary" href="/quick/">
            {tr("nav.quick")}
            {data.quickEntries?.length ? ` (${data.quickEntries.length})` : ""}
          </Link>
          <Link className="button" href="/sessions/new/">
            {tr("sessions.add")}
          </Link>
        </div>
      </div>
      <section className="card">
        <SessionList
          sessions={data.sessions}
          medals={sessionMedalCounts(data.sessions, data.assessments)}
        />
      </section>
    </>
  );
}
