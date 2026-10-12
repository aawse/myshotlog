import Link from "next/link";
import { sessionMedalCounts } from "@/lib/session-medals";
import {
  Plus,
  ArrowRight,
  CalendarDays,
  Crosshair,
  Target,
} from "lucide-react";
import { records } from "@/lib/data";
import { SessionList } from "@/components/session-list";
import { ProgressChart } from "@/components/progress-chart";
export default async function Dashboard() {
  const data = await records();
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
      <div className="page-heading">
        <div>
          <span className="eyebrow">DIN TRÄNING, SAMLAD</span>
          <h1>
            {data.profile.displayName
              ? "Hej, " + data.profile.displayName + "."
              : "Välkommen till din journal."}
          </h1>
          <p>Ett pass i taget. Följ din utveckling på banan.</p>
        </div>
        <Link className="button" href="/sessions/new">
          <Plus size={18} /> Registrera pass
        </Link>
      </div>
      <section className="hero-panel">
        <div>
          <span className="eyebrow">FOKUS PÅ UTVECKLING</span>
          <h2>
            Gör varje pass
            <br />
            till en erfarenhet.
          </h2>
          <p>
            Samla dina resultat, hitta mönstren och
            <br />
            ta med lärdomarna till nästa träning.
          </p>
          <Link href="/sessions/new">
            Börja registrera <ArrowRight size={17} />
          </Link>
        </div>
        <div className="target-art" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <span>+</span>
        </div>
        <span className="hero-mark">25 m / NATIONELLT PISTOLSKYTTE</span>
      </section>
      <div className="stats">
        <section className="card stat">
          <CalendarDays />
          <span>Träningspass</span>
          <strong>{data.sessions.length}</strong>
          <small>{monthly.length} denna månad</small>
        </section>
        <section className="card stat">
          <Crosshair />
          <span>Registrerade skott</span>
          <strong>{shots.toLocaleString("sv")}</strong>
          <small>Alla dina pass</small>
        </section>
        <section className="card stat">
          <Target />
          <span>Aktiva vapen</span>
          <strong>{data.firearms.filter((f) => !f.archived).length}</strong>
          <small>Historiken bevaras vid arkivering</small>
        </section>
      </div>
      <div className="dashboard-grid">
        <ProgressChart sessions={data.sessions} />
        <section className="card qualification-teaser">
          <span className="eyebrow">MÄRKESPROGRESS</span>
          <div className="medal-art" aria-hidden="true">
            ◎
          </div>
          <h2>
            Dina delprestationer,
            <br />
            tydligt förklarade.
          </h2>
          <p>
            Se verifierade provkrav och vad som återstår. Varje bedömning visar
            sin regelkälla.
          </p>
          <Link href="/qualifications">
            Visa märkesprogress <ArrowRight size={17} />
          </Link>
          <span className="muted">
            Personligt underlag · inget officiellt intyg
          </span>
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PÅ BANAN</span>
            <h2>Senaste träningspassen</h2>
          </div>
          <Link className="inline-link" href="/sessions">
            Alla pass <ArrowRight size={16} />
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
