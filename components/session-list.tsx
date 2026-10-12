"use client";
import Link from "next/link";
import { useState } from "react";
import { Search, ArrowUpRight, Medal } from "lucide-react";
import type { Session } from "@/lib/models";
import { disciplines, discipline } from "@/lib/disciplines";
import type { SeriesMedals } from "@/lib/session-medals";
export function SessionList({
  sessions,
  medals,
  compact = false,
}: {
  sessions: Session[];
  medals: Record<string, SeriesMedals>;
  compact?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const list = sessions.filter(
    (s) =>
      (!filter || s.discipline === filter) &&
      (!from || s.date >= from) &&
      (!to || s.date <= to) &&
      [
        s.location,
        s.notes,
        s.program,
        s.firearmSnapshot?.nickname,
        s.firearmSnapshot?.model,
        s.firearmSnapshot?.make,
        s.group,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      {!compact && (
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Sök pass"
              placeholder="Sök plats, vapen eller anteckning…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrera gren"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Alla grenar</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label>
            Från
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Till
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      )}
      {list.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PASS / DATUM</th>
                <th>VAPEN</th>
                <th>RESULTAT</th>
                <th aria-label="Öppna"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const shots = s.results.reduce((sum, r) => sum + r.shots, 0),
                  kind = discipline(s.discipline).kind;
                const counts = medals[s.id] ?? {
                  gold: 0,
                  silver: 0,
                  bronze: 0,
                  unassessed: s.results.length,
                };
                return (
                  <tr key={s.id} className="session-list-row">
                    <td>
                      <Link
                        className="row-title"
                        href={"/sessions/" + s.id}
                        aria-label={`Visa ${discipline(s.discipline).name}, ${s.date}${s.location ? ", " + s.location : ""}`}
                      >
                        {discipline(s.discipline).name}
                      </Link>
                      <span className="subline">
                        {new Intl.DateTimeFormat("sv-SE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(s.date + "T12:00:00Z"))}{" "}
                        · {s.location || "Ingen plats"}
                      </span>
                    </td>
                    <td>
                      {s.firearmSnapshot
                        ? `${s.firearmSnapshot.make} ${s.firearmSnapshot.model}`
                        : "Lånat vapen"}
                      {s.firearmSnapshot?.nickname && (
                        <span className="subline">
                          {s.firearmSnapshot.nickname}
                        </span>
                      )}
                      <span className="subline">Vapengrupp {s.group}</span>
                    </td>
                    <td>
                      <div
                        className="series-medals"
                        aria-label="Serier per högsta uppnådda valör"
                      >
                        {(
                          [
                            ["gold", "Guld"],
                            ["silver", "Silver"],
                            ["bronze", "Brons"],
                          ] as const
                        ).map(([level, label]) => (
                          <span
                            className={"series-medal " + level}
                            key={level}
                            aria-label={`${label}: ${counts[level]} serier`}
                            title={`${label}: ${counts[level]} serier`}
                          >
                            <Medal size={20} aria-hidden="true" />
                            <strong>{counts[level]}</strong>
                          </span>
                        ))}
                      </div>
                      <span className="subline">
                        {s.results.length}{" "}
                        {kind === "field" ? "stationer" : "serier"} · {shots}{" "}
                        skott
                      </span>
                      {counts.unassessed > 0 && (
                        <span className="subline">
                          {counts.unassessed} ej bedömda
                        </span>
                      )}
                    </td>
                    <td>
                      <ArrowUpRight size={19} aria-hidden="true" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <span className="empty-target">◎</span>
          <h3>
            {sessions.length
              ? "Inga matchande pass"
              : "Ditt nästa pass börjar här"}
          </h3>
          <p>
            {sessions.length
              ? "Prova ett annat filter."
              : "Registrera ditt första pass och följ din utveckling över tid."}
          </p>
          {!sessions.length && (
            <Link className="button secondary" href="/sessions/new">
              Registrera ett pass →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
