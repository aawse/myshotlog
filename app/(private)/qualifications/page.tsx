import Link from "next/link";
import { records } from "@/lib/data";
import { progress } from "@/lib/rules/engine";
import { rules, levels, levelLabels } from "@/lib/rules/catalog";
import { disciplines, handbookUrl } from "@/lib/disciplines";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; group?: string }>;
}) {
  const q = await searchParams;
  const data = await records();
  const y = Number(
    q.year ??
      new Intl.DateTimeFormat("sv", {
        timeZone: data.profile.timezone,
        year: "numeric",
      }).format(new Date()),
  );
  const year = Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : 2026;
  const group = ["A", "B", "C"].includes(q.group ?? "") ? q.group! : "C";
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERSONLIGT UNDERLAG</span>
          <h1>Märkesprogress</h1>
          <p>Delprestationer och återstående prov, med spårbara regler.</p>
        </div>
      </div>
      <p className="muted">
        Personlig progression från dina sparade resultat och seriens
        regelversion.
      </p>
      <form className="filters">
        <label>
          Kalenderår
          <input
            name="year"
            type="number"
            min="1900"
            max="2100"
            defaultValue={year}
          />
        </label>
        <label>
          Vapengrupp
          <select name="group" defaultValue={group}>
            {["A", "B", "C"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <button className="secondary">Visa</button>
      </form>
      <div className="qualification-grid">
        {levels.map((level) => {
          const p = progress(
            data.sessions,
            data.assessments,
            year,
            group,
            level,
          );
          return (
            <section className="card" key={level}>
              <span className={"medal " + level}>◎</span>
              <h2>{levelLabels[level]}</h2>
              <p className="muted">Pistolskyttemärkets ordinarie provväg</p>
              <label>
                Precision <strong>{Math.min(p.precision, 3)} / 3</strong>
                <progress max="3" value={p.precision} />
              </label>
              <label>
                Tillämpning <strong>{Math.min(p.application, 3)} / 3</strong>
                <progress max="3" value={p.application} />
              </label>
              <p className="pill">
                {p.status === "met"
                  ? "Registrerade delprestationer uppfyllda"
                  : p.status === "not-evaluated"
                    ? "Ej bedömt"
                    : "Fler delprestationer behövs"}
              </p>
              <p className="muted">{p.reason}</p>
            </section>
          );
        })}
      </div>
      <section className="card">
        <h2>Regelversioner och täckning</h2>
        {rules.map((r) => (
          <p key={r.id}>
            <strong>{r.edition}</strong> · {r.from} till {r.until} (exklusivt)
            <br />
            {r.reference}
            <br />
            <code>{r.id}</code>
          </p>
        ))}
        <p>
          <a
            className="inline-link"
            href={handbookUrl}
            target="_blank"
            rel="noreferrer"
          >
            Läs källdokumentet ↗
          </a>
        </p>
        <p className="muted">
          Utgåvan är publicerad av SPSF och hämtad via Svenska PPC-cupen. Senare
          ändringar är inte fullständigt inventerade. Gällande metadata och
          begränsningar finns i docs/RULES.md. Sparade bedömningar finns på
          varje pass; denna översikt räknar enbart sparade bedömningar från
          aktuell revision. Nya regler och ändrade födelseuppgifter påverkar
          bara nya serier.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Gren</th>
                <th>Källa</th>
                <th>Bedömning</th>
              </tr>
            </thead>
            <tbody>
              {disciplines.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.section}</td>
                  <td>
                    {["precision", "application"].includes(d.id)
                      ? "Ordinarie delprov, A/B/C"
                      : "Ej bedömt"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link className="inline-link" href="/sessions">
          Visa pass och sparade bedömningar →
        </Link>
      </section>
    </>
  );
}
