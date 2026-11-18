"use client";
import { useI18n } from "@/components/language-provider";
import { useState } from "react";
import type { Session } from "@/lib/models";
import { disciplineName } from "@/lib/i18n-domain";
import { discipline } from "@/lib/disciplines";
import { summarize } from "@/lib/rules/engine";
export function ProgressChart({
  sessions,
  compact = false,
}: {
  sessions: Session[];
  compact?: boolean;
}) {
  const { tr, language, locale } = useI18n();

  const groups = Array.from(
    new Set(
      sessions.map((s) => JSON.stringify([s.discipline, s.group, s.program])),
    ),
  );
  const [selection, setSelected] = useState("");
  const selected = groups.includes(selection) ? selection : (groups[0] ?? "");
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
  const minimum = Math.floor(Math.min(...(values.length ? values : [0])));
  const maximum = Math.max(Math.ceil(Math.max(...values, 0)), minimum + 1);
  const coordinates = values.map((value, index) => ({
    x: values.length === 1 ? 250 : 12 + (index * 476) / (values.length - 1),
    y: 112 - ((value - minimum) / (maximum - minimum)) * 100,
  }));
  const unit =
    kind === "points"
      ? tr("chart.pointsPerShot")
      : kind === "time" || kind === "dynamic"
        ? tr("csv.seconds")
        : tr("session.hits");
  return (
    <section className="card chart">
      <div className="section-heading">
        <div>
          {!compact && <span className="eyebrow">{tr("chart.eyebrow")}</span>}
          <h2>{tr("chart.heading")}</h2>
        </div>
        <span className="pill">{tr("chart.latest")}</span>
      </div>
      {groups.length ? (
        <>
          {compact ? (
            <p className="muted">
              {disciplineName(language, rows[0].discipline)} · {rows[0].group} ·{" "}
              {rows[0].program} · {unit}
            </p>
          ) : (
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
          )}
          <div className="trend-chart">
            <svg
              viewBox="0 0 500 124"
              role="img"
              aria-label={tr("chart.resultUnit") + unit}
            >
              {[12, 62, 112].map((y) => (
                <line
                  key={y}
                  x1="12"
                  x2="488"
                  y1={y}
                  y2={y}
                  className="trend-gridline"
                />
              ))}
              <polyline
                points={coordinates.map(({ x, y }) => x + "," + y).join(" ")}
              />
              {coordinates.map(({ x, y }, index) => (
                <circle key={rows[index].id} cx={x} cy={y} r="4">
                  <title>{`${rows[index].date} · ${values[index].toLocaleString(locale, { maximumFractionDigits: 2 })}`}</title>
                </circle>
              ))}
            </svg>
            <div className="trend-dates">
              <time>{rows[0]?.date}</time>
              <time>{rows.length > 1 ? rows.at(-1)?.date : ""}</time>
            </div>
          </div>
          {!compact && (
            <>
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
          )}
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
