import Link from "next/link";
import { sessionMedalCounts } from "@/lib/session-medals";
import { records } from "@/lib/data";
import { SessionList } from "@/components/session-list";
export default async function Page() {
  const data = await records();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DIN JOURNAL</span>
          <h1>Träningspass</h1>
          <p>Resultat och lärdomar från varje besök på banan.</p>
        </div>
        <div className="actions">
          <Link className="button secondary" href="/quick">
            Snabbserie
            {data.quickEntries?.length ? ` (${data.quickEntries.length})` : ""}
          </Link>
          <Link className="button" href="/sessions/new">
            + Registrera pass
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
