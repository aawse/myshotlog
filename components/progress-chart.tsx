"use client";
import { useI18n } from "@/components/language-provider";
import { useState } from "react";
import type { Session } from "@/lib/models";
import { disciplineName } from "@/lib/i18n-domain";
import { discipline } from "@/lib/disciplines";
import { summarize } from "@/lib/rules/engine";
export function ProgressChart({ sessions }: { sessions: Session[] }) {
  const { tr, language, locale } = useI18n();

  const groups = Array.from(
    new Set(
      sessions.map((s) => JSON.stringify([s.discipline, s.group, s.program])),
    ),
  );
  const [selected, setSelected] = useState(groups[0] ?? "");
  const rows = sessions
    .filter(
      (s) => JSON.stringify([s.discipline, s.group, s.program]) === selected,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);
  const kind = rows[0] ? discipline(rows[0].discipline).kind : "points";
  const values = rows.map((s) => {
    const t = summarize(s);
    return kind === "points"
      ? t.shots
        ? t.points / t.shots
        : 0
      : kind === "time" || kind === "dynamic"
        ? t.seconds
        : t.hits;
  });
  const max = Math.max(...values, 1),
    unit =
      kind === "points"
        ? tr("chart.pointsPerShot")
        : kind === "time" || kind === "dynamic"
          ? tr("csv.seconds")
          : tr("session.hits");
  return (
    <section className="card chart">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tr("chart.eyebrow")}</span>
          <h2>{tr("chart.heading")}</h2>
        </div>
        <span className="pill">{tr("chart.latest")}</span>
      </div>
      {groups.length ? (
        <>
          <label>
            {tr("chart.compare")}
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {groups.map((g) => {
                const [id, group, program] = JSON.parse(g);
                return (
                  <option key={g} value={g}>
                    {disciplineName(language, id)} · {group} · {program}
                  </option>
                );
              })}
            </select>
          </label>
          <div
            className="bar-chart"
            role="img"
            aria-label={tr("chart.resultUnit") + unit}
          >
            {rows.map((s, i) => (
              <div className="bar-col" key={s.id}>
                <span>
                  {new Intl.NumberFormat(locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }).format(values[i])}
                </span>
                <div
                  className="bar"
                  style={{
                    height: Math.max(2, (values[i] / max) * 110) + "px",
                  }}
                />
                <small>{s.date.slice(5)}</small>
              </div>
            ))}
          </div>
          <p className="muted">
            <span className="text-lowercase">{unit}</span>
            {tr("chart.help")}
          </p>
          <details>
            <summary>{tr("chart.table")}</summary>
            <table>
              <thead>
                <tr>
                  <th>{tr("common.date")}</th>
                  <th>{unit}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>
                      {new Intl.NumberFormat(locale, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(values[i])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <div className="empty">
          <p>{tr("chart.empty")}</p>
          <div className="chart-placeholder" aria-hidden="true">
            ▁ ▂ ▂ ▃ ▂ ▄ ▄ ▅ ▄ ▆
          </div>
        </div>
      )}
    </section>
  );
}
