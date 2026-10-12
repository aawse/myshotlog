"use client";
import { useState } from "react";
import type { Session } from "@/lib/models";
import { discipline } from "@/lib/disciplines";
import { summarize } from "@/lib/rules/engine";
export function ProgressChart({ sessions }: { sessions: Session[] }) {
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
      ? t.points / t.shots
      : kind === "time" || kind === "dynamic"
        ? t.seconds
        : t.hits;
  });
  const max = Math.max(...values, 1),
    unit =
      kind === "points"
        ? "poäng/skott"
        : kind === "time" || kind === "dynamic"
          ? "sekunder"
          : "träffar";
  return (
    <section className="card chart">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ÖVER TID</span>
          <h2>Din utveckling</h2>
        </div>
        <span className="pill">Senaste 12 passen</span>
      </div>
      {groups.length ? (
        <>
          <label>
            Jämför samma gren, vapengrupp och program
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {groups.map((g) => {
                const [id, group, program] = JSON.parse(g);
                return (
                  <option key={g} value={g}>
                    {discipline(id).name} · {group} · {program}
                  </option>
                );
              })}
            </select>
          </label>
          <div
            className="bar-chart"
            role="img"
            aria-label={"Resultat i " + unit}
          >
            {rows.map((s, i) => (
              <div className="bar-col" key={s.id}>
                <span>{values[i].toFixed(1)}</span>
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
            {unit}. Skillnader i mål, bana och tävlingsförhållanden kan påverka
            jämförelsen.
          </p>
          <details>
            <summary>Visa värden som tabell</summary>
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>{unit}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{values[i].toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <div className="empty">
          <p>Efter ditt första pass börjar kurvan ta form.</p>
          <div className="chart-placeholder" aria-hidden="true">
            ▁ ▂ ▂ ▃ ▂ ▄ ▄ ▅ ▄ ▆
          </div>
        </div>
      )}
    </section>
  );
}
