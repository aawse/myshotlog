import { localizeMessage } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
import { records } from "@/lib/data";
import { progress } from "@/lib/rules/engine";
import { rules, levels } from "@/lib/rules/catalog";
import { disciplineName, sourceSection } from "@/lib/i18n-domain";
import { disciplines, handbookUrl } from "@/lib/disciplines";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    group?: string;
  }>;
}) {
  const { tr, language } = await getI18n();

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
          <span className="eyebrow">{tr("qualifications.eyebrow")}</span>
          <h1>{tr("nav.qualifications")}</h1>
          <p>{tr("qualifications.intro")}</p>
        </div>
      </div>
      <p className="muted">{tr("qualifications.help")}</p>
      <form className="filters">
        <label>
          {tr("qualifications.year")}
          <input
            name="year"
            type="number"
            min="1900"
            max="2100"
            defaultValue={year}
          />
        </label>
        <label>
          {tr("sessions.groupPrefix")}
          <select name="group" defaultValue={group}>
            {["A", "B", "C"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <button className="secondary">{tr("qualifications.show")}</button>
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
              <h2>{tr(`level.${level}`)}</h2>
              <p className="muted">{tr("qualifications.path")}</p>
              <label>
                {tr("qualifications.precision")}{" "}
                <strong>{Math.min(p.precision, 3)} / 3</strong>
                <progress max="3" value={p.precision} />
              </label>
              <label>
                {tr("qualifications.application")}{" "}
                <strong>{Math.min(p.application, 3)} / 3</strong>
                <progress max="3" value={p.application} />
              </label>
              <p className="pill">
                {p.status === "met"
                  ? tr("qualifications.met")
                  : p.status === "not-evaluated"
                    ? tr("assessment.notEvaluated")
                    : tr("qualifications.more")}
              </p>
              <p className="muted">{localizeMessage(language, p.reason)}</p>
            </section>
          );
        })}
      </div>
      <section className="card">
        <h2>{tr("qualifications.coverage")}</h2>
        {rules.map((r) => (
          <p key={r.id}>
            <strong>{localizeMessage(language, r.edition)}</strong> · {r.from}{" "}
            {tr("sessions.to")} {r.until} {tr("qualifications.exclusive")}
            <br />
            {localizeMessage(language, r.reference)}
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
            {tr("qualifications.source")}
          </a>
        </p>
        <p className="muted">{tr("qualifications.sourceHelp")}</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr("session.sport")}</th>
                <th>{tr("qualifications.sourceColumn")}</th>
                <th>{tr("qualifications.assessment")}</th>
              </tr>
            </thead>
            <tbody>
              {disciplines.map((d) => (
                <tr key={d.id}>
                  <td>{disciplineName(language, d.id)}</td>
                  <td>{sourceSection(language, d.id)}</td>
                  <td>
                    {["precision", "application"].includes(d.id)
                      ? tr("qualifications.standardTests")
                      : tr("assessment.notEvaluated")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link className="inline-link" href="/sessions">
          {tr("qualifications.viewSessions")}
        </Link>
      </section>
    </>
  );
}
