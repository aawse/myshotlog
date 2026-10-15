"use client";
import { hitFactor } from "@/lib/result-metrics";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "@/components/language-provider";
import Link from "next/link";
import { PhotoViewer } from "@/components/photo-viewer";
import { Medal, CircleX, CircleHelp } from "lucide-react";
import { JournalMissing } from "../journal-missing";
import { witnessCurrent } from "@/lib/witness/model";
import { BrowserWitnessPanel } from "@/components/browser-witness-panel";
import { useRecords } from "@/components/journal-provider";
import { disciplineName, targetName, caliberName } from "@/lib/i18n-domain";
import { sessionSeriesRatings } from "@/lib/session-medals";
import { summarize } from "@/lib/rules/engine";
import { SessionPrint } from "@/components/session-print";
import { SessionActions } from "@/components/session-actions";
export default function View({ id }: { id: string }) {
  const { tr, language } = useI18n();

  const labels = {
    "not-applicable": tr("assessment.notApplicable"),
    "not-evaluated": tr("assessment.notEvaluated"),
  };
  const data = useRecords();
  const s = data.sessions.find((s) => s.id === id);
  if (!s) return <JournalMissing />;
  const signoffs = (data.witnessSignoffs ?? [])
    .filter((w) => w.sessionId === id)
    .sort((a, b) => b.signedAt.localeCompare(a.signedAt))
    .map((w) => ({ ...w, current: witnessCurrent(w, s) }));
  const total = summarize(s);
  const assessments = data.assessments.filter((a) => a.sessionId === id);
  const ratings = sessionSeriesRatings(s, assessments);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {s.date} · {s.location || tr("common.noLocation")}
          </span>
          <h1>{disciplineName(language, s.discipline)}</h1>
          <p>
            {s.program} ·{" "}
            {s.context === "practice"
              ? tr("session.practice")
              : tr("session.competition")}{" "}
            {tr("details.revision")} {s.revision}
          </p>
        </div>
        <div className="actions">
          <SessionPrint id={id} date={s.date} />
          <Link
            className="button secondary"
            href={"/sessions/" + id + "/edit/"}
          >
            {tr("session.editHeading")}
          </Link>
        </div>
      </div>
      <section className="card">
        <h2>
          {s.firearmSnapshot
            ? s.firearmSnapshot.nickname ||
              s.firearmSnapshot.make + " " + s.firearmSnapshot.model
            : tr("common.borrowedFirearm")}
          {s.firearmSnapshot && (
            <> · {caliberName(language, s.firearmSnapshot.caliber)}</>
          )}
        </h2>
        <p>
          {tr("sessions.groupPrefix")} {s.group} · {total.shots}{" "}
          {tr("details.shotsSeparator")} {s.results.length}{" "}
          {tr("details.entries")}
        </p>
        {(s.distance !== undefined || s.target !== undefined) && (
          <p>
            {tr("details.distance")}{" "}
            {s.distance !== null && s.distance !== undefined
              ? s.distance + " m"
              : tr("common.notSpecified")}{" "}
            {tr("details.target")} {targetName(language, s.target)}
          </p>
        )}
        <p>
          {tr("details.time")}{" "}
          {s.seconds !== null && s.seconds !== undefined
            ? s.seconds + " s"
            : s.results.some((r) => r.seconds !== undefined)
              ? tr("details.oldTimes")
              : tr("common.notSpecified")}
        </p>
        {s.ruleReference && (
          <p>
            {tr("session.ruleReference")}: {s.ruleReference}
          </p>
        )}
        <div className="table-scroll">
          <table className="series-results">
            <thead>
              <tr>
                <th>{tr("details.seriesStage")}</th>
                <th>{tr("session.points")}</th>
                <th>{tr("details.hitsFigures")}</th>
                <th>{tr("details.deductions")}</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map(({ result: r, medal, assessment, points }) => {
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="series-label">
                        {r.label}
                        {medal && (
                          <span
                            className={"series-medal " + medal}
                            role="img"
                            aria-label={tr("details.medalSeries", {
                              level: tr(`level.${medal}`),
                            })}
                            title={tr("details.medalSeries", {
                              level: tr(`level.${medal}`),
                            })}
                          >
                            <Medal size={20} aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="subline">
                        {r.shots}{" "}
                        <span className="text-lowercase">
                          {tr("session.shots")}
                        </span>
                        {r.scoring
                          ? " · " +
                            (r.scoring === "points"
                              ? tr("details.fieldPoints")
                              : tr("session.ordinaryScoring"))
                          : ""}
                      </span>
                      <span className="subline">
                        {tr("details.ruleVersion")}{" "}
                        {assessment?.ruleVersion ?? tr("details.notRecorded")}
                      </span>
                      {r.photoId && (
                        <PhotoViewer
                          src={"/api/photos/" + r.photoId + "/"}
                          label={r.label}
                        />
                      )}
                    </td>
                    <td>
                      {points ?? "–"}
                      {r.elapsedSeconds !== undefined && (
                        <span className="subline">
                          {tr("session.elapsedSeconds")}: {r.elapsedSeconds}
                          {" s"}
                        </span>
                      )}
                      {hitFactor(r, s.discipline) !== undefined && (
                        <span className="subline">
                          {tr("session.hitFactor")}:{" "}
                          {hitFactor(r, s.discipline)!.toFixed(4)}
                        </span>
                      )}
                      {r.matchPercent !== undefined && (
                        <span className="subline">{r.matchPercent}%</span>
                      )}
                      {r.placement !== undefined && (
                        <span className="subline">
                          {tr("session.placement")}: {r.placement}
                        </span>
                      )}
                      {r.dryFire && (
                        <span className="subline">{tr("session.dryFire")}</span>
                      )}
                      {r.scoreText && (
                        <span className="subline">{r.scoreText}</span>
                      )}
                      {r.status && r.status !== "completed" && (
                        <span className="subline">
                          {tr(`resultStatus.${r.status}`)}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.hits ?? "–"} / {r.figures ?? "–"}
                      {r.scoring === "points" && (
                        <span className="subline">
                          {(r.hits ?? 0) + (r.figures ?? 0)}{" "}
                          <span className="text-lowercase">
                            {tr("details.fieldPoints")}
                          </span>
                        </span>
                      )}
                    </td>
                    <td>
                      {tr("details.penalties", {
                        points: r.penaltyPoints ?? 0,
                        seconds: r.penaltySeconds ?? 0,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">{tr("print.netPoints")}</p>
        {s.notes && <p className="notes">{s.notes}</p>}
      </section>
      <BrowserWitnessPanel
        sessionId={id}
        results={s.results}
        signoffs={signoffs}
      />
      <section className="card">
        <h2>{tr("details.assessments")}</h2>
        <p className="muted">{tr("details.assessmentHelp")}</p>
        {ratings.map(({ result, medal, status, assessment: a, points }) => (
          <div className="assessment" key={result.id}>
            <strong>
              <span className="calculation-grade">
                {medal ? (
                  <span
                    className={`series-medal ${medal}`}
                    role="img"
                    aria-label={tr("details.medalSeries", {
                      level: tr(`level.${medal}`),
                    })}
                  >
                    <Medal size={20} aria-hidden="true" />
                  </span>
                ) : status === "not-met" ? (
                  <span
                    className="assessment-cross"
                    role="img"
                    aria-label={tr("details.gradeNotAchieved")}
                  >
                    <CircleX size={20} aria-hidden="true" />
                  </span>
                ) : (
                  <CircleHelp size={20} aria-hidden="true" />
                )}
                {medal
                  ? tr(`level.${medal}`)
                  : status === "not-met"
                    ? tr("details.gradeNotAchieved")
                    : status === "not-applicable"
                      ? labels["not-applicable"]
                      : labels["not-evaluated"]}
              </span>{" "}
              · {result.label}
            </strong>
            {points !== undefined ? (
              <p>{tr("quick.points", { p0: points })}</p>
            ) : (
              a && <p>{localizeMessage(language, a.reason)}</p>
            )}
            {points !== undefined &&
              a &&
              (status === "not-evaluated" || status === "not-applicable") && (
                <p>{localizeMessage(language, a.reason)}</p>
              )}
            {a && (
              <>
                <small>
                  {a.ruleVersion} · {a.createdAt.slice(0, 10)}
                </small>
                {a.source && (
                  <p className="muted">{localizeMessage(language, a.source)}</p>
                )}
                <details>
                  <summary>{tr("details.showInput")}</summary>
                  <pre>{JSON.stringify(a.input, null, 2)}</pre>
                </details>
              </>
            )}
          </div>
        ))}
        <SessionActions id={id} />
      </section>
    </>
  );
}
