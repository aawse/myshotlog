import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
import { sessionMedalCounts } from "@/lib/session-medals";
import { records } from "@/lib/data";
import { SessionList } from "@/components/session-list";
export default async function Page() {
  const { tr } = await getI18n();

  const data = await records();
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
