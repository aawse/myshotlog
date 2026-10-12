"use client";
import { useI18n } from "@/components/language-provider";
import Link from "next/link";
import { useState } from "react";
import { Search, ArrowUpRight, Medal } from "lucide-react";
import type { Session } from "@/lib/models";
import { disciplineName } from "@/lib/i18n-domain";
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
  const { tr, language, locale } = useI18n();

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
              aria-label={tr("sessions.search")}
              placeholder={tr("sessions.searchHint")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label={tr("sessions.filterSport")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">{tr("sessions.allSports")}</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {disciplineName(language, d.id)}
              </option>
            ))}
          </select>
          <label>
            {tr("sessions.from")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {tr("sessions.to")}
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
                <th>{tr("sessions.dateHeading")}</th>
                <th className="text-uppercase">{tr("session.firearm")}</th>
                <th className="text-uppercase">{tr("session.result")}</th>
                <th aria-label={tr("sessions.open")}></th>
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
                        aria-label={tr("sessions.view", {
                          p0: disciplineName(language, s.discipline),
                          p1: s.date,
                          p2: s.location ? ", " + s.location : "",
                        })}
                      >
                        {disciplineName(language, s.discipline)}
                      </Link>
                      <span className="subline">
                        {new Intl.DateTimeFormat(locale, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(s.date + "T12:00:00Z"))}{" "}
                        · {s.location || tr("common.noLocation")}
                      </span>
                    </td>
                    <td>
                      {s.firearmSnapshot
                        ? `${s.firearmSnapshot.make} ${s.firearmSnapshot.model}`
                        : tr("common.borrowedFirearm")}
                      {s.firearmSnapshot?.nickname && (
                        <span className="subline">
                          {s.firearmSnapshot.nickname}
                        </span>
                      )}
                      <span className="subline">
                        {tr("sessions.groupPrefix")} {s.group}
                      </span>
                    </td>
                    <td>
                      <div
                        className="series-medals"
                        aria-label={tr("sessions.medals")}
                      >
                        {(
                          [
                            ["gold", tr("level.gold")],
                            ["silver", tr("level.silver")],
                            ["bronze", tr("level.bronze")],
                          ] as const
                        ).map(([level, label]) => (
                          <span
                            className={"series-medal " + level}
                            key={level}
                            aria-label={tr("sessions.medalCount", {
                              p0: label,
                              p1: counts[level],
                            })}
                            title={tr("sessions.medalCount", {
                              p0: label,
                              p1: counts[level],
                            })}
                          >
                            <Medal size={20} aria-hidden="true" />
                            <strong>{counts[level]}</strong>
                          </span>
                        ))}
                      </div>
                      <span className="subline">
                        {kind === "field" ? (
                          <>
                            {s.results.length} {tr("common.stations")}
                          </>
                        ) : (
                          tr("common.seriesCount", { count: s.results.length })
                        )}{" "}
                        · {shots}{" "}
                        <span className="text-lowercase">
                          {tr("session.shots")}
                        </span>
                      </span>
                      {counts.unassessed > 0 && (
                        <span className="subline">
                          {tr("assessment.notEvaluated")}: {counts.unassessed}
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
              ? tr("sessions.noMatch")
              : tr("sessions.emptyHeading")}
          </h3>
          <p>
            {sessions.length
              ? tr("sessions.filterHelp")
              : tr("sessions.emptyHelp")}
          </p>
          {!sessions.length && (
            <Link className="button secondary" href="/sessions/new">
              {tr("sessions.recordLink")}
            </Link>
          )}
        </div>
      )}
    </>
  );
}
