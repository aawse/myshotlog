"use client";
import { sessionDisplayConditions } from "@/lib/session-conditions";
import { distanceText } from "@/lib/events/programs";
import { seriesConditions } from "@/lib/models";
import { hitFactor } from "@/lib/result-metrics";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "@/components/language-provider";
import Link from "next/link";
import { PhotoViewer } from "@/components/photo-viewer";
import { Medal, CircleX, CircleHelp, ChevronDown } from "lucide-react";
import { JournalMissing } from "../journal-missing";
import { witnessCurrent } from "@/lib/witness/model";
import { BrowserWitnessPanel } from "@/components/browser-witness-panel";
import { useRecords } from "@/components/journal-provider";
import { disciplineName, targetName, caliberName } from "@/lib/i18n-domain";
import { sessionSeriesRatings } from "@/lib/session-medals";
import { summarize } from "@/lib/rules/engine";
import { appliedAgeGroups, appliedRuleGroups } from "@/lib/rules/presentation";
import { AssessmentBasis } from "@/components/assessment-basis";
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
  const conditions = sessionDisplayConditions(s);
  const assessments = data.assessments.filter((a) => a.sessionId === id);
  const ratings = sessionSeriesRatings(s, assessments);
  const ruleGroups = appliedRuleGroups(s, ratings);
  const ageGroups = appliedAgeGroups(ratings);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {tr(
              s.context === "practice"
                ? "session.practice"
                : "session.competition",
            )}{" "}
            · <time dateTime={s.date}>{s.date}</time>
          </h1>
          <p>{s.location || tr("common.noLocation")}</p>
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
      <section className="card session-overview">
        <h2>
          {s.firearmSnapshot
            ? s.firearmSnapshot.nickname ||
              s.firearmSnapshot.make + " " + s.firearmSnapshot.model
            : tr("common.borrowedFirearm")}
          {s.firearmSnapshot && (
            <> · {caliberName(language, s.firearmSnapshot.caliber)}</>
          )}
        </h2>
        <div className="session-facts">
          <p>
            {disciplineName(language, s.discipline)}
            {s.program ? " · " + s.program : ""}
          </p>
          <p>
            {tr("sessions.groupPrefix")} {s.group} · {total.shots}{" "}
            {tr("details.shotsSeparator")} {s.results.length}{" "}
            {tr("details.entries")}
          </p>
          {(conditions.distance !== undefined ||
            conditions.target !== undefined) && (
            <p>
              {tr("details.distance")}{" "}
              {conditions.distance !== null && conditions.distance !== undefined
                ? conditions.distance + " m"
                : tr("common.notSpecified")}{" "}
              {tr("details.target")} {targetName(language, conditions.target)}
            </p>
          )}
          <p>
            {tr("details.time")}{" "}
            {conditions.seconds !== null && conditions.seconds !== undefined
              ? conditions.seconds + " s"
              : s.results.some((r) => r.seconds !== undefined)
                ? tr("details.oldTimes")
                : tr("common.notSpecified")}
          </p>
          {s.firearmSnapshot?.hasOptic && <p>{tr("firearm.hasOptic")}</p>}
          {s.ruleReference &&
            !ruleGroups.some(
              (group) => group.declared && group.edition === s.ruleReference,
            ) && (
              <p>
                {tr("session.ruleReference")}: {s.ruleReference}
              </p>
            )}
        </div>
        <div className="session-rules">
          {ruleGroups.length ? (
            ruleGroups.map((group, index) => (
              <p key={group.id}>
                {index === 0 && (
                  <>
                    <strong>{tr("details.ruleVersion")}</strong>{" "}
                  </>
                )}
                {group.edition
                  ? group.declared
                    ? group.edition
                    : localizeMessage(language, group.edition)
                  : tr(
                      group.declared
                        ? "common.notSpecified"
                        : "details.ruleEditionUnknown",
                    )}
                {ruleGroups.length > 1 && (
                  <span className="subline">{group.series.join(", ")}</span>
                )}
                {group.reference && (
                  <span className="subline">
                    {localizeMessage(language, group.reference)}
                  </span>
                )}
              </p>
            ))
          ) : (
            <p>
              <strong>{tr("details.ruleVersion")}</strong>{" "}
              {tr("details.notRecorded")}
            </p>
          )}
        </div>
        {s.discipline === "precision" &&
          ageGroups.map((group, index) => (
            <p key={index} className="muted">
              <strong>{tr("details.calculationAge")}: </strong>
              {group.age === undefined
                ? tr("details.notRecorded")
                : tr("basis.age", { age: group.age, year: group.year ?? "" })}
              {ageGroups.length > 1 && (
                <span className="subline">{group.series.join(", ")}</span>
              )}
            </p>
          ))}
        <div className="session-assessments">
          <h2>{tr("details.assessments")}</h2>
          <p className="muted">{tr("details.assessmentHelp")}</p>
          {ratings.map(({ result, medal, status, assessment: a, points }) => {
            const summary = (
              <>
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
                  </span>
                  <span className="assessment-series-name">{result.label}</span>
                </strong>
                {points !== undefined && (
                  <span className="assessment-score">
                    {tr("quick.points", { p0: points })}
                  </span>
                )}
                <span className="assessment-toggle">
                  <span className="visually-hidden">
                    {tr("details.showInput")}
                  </span>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </>
            );
            return (
              <div className="assessment" key={result.id}>
                {signoffs
                  .filter((w) => w.resultId === result.id)
                  .map((w) => (
                    <p key={w.id}>
                      {tr("print.witnessed", { names: w.name })} ·{" "}
                      {tr(w.current ? "witness.current" : "witness.changed")}
                    </p>
                  ))}
                <details>
                  <summary
                    className="assessment-summary"
                    title={tr("details.showInput")}
                  >
                    {summary}
                  </summary>
                  <div className="assessment-expanded">
                    <dl className="series-result-details">
                      <div>
                        <dt>{tr("details.seriesStage")}</dt>
                        <dd>
                          <span className="subline">
                            {distanceText(seriesConditions(s, result))}
                            {" · "}
                            {result.shots}{" "}
                            <span className="text-lowercase">
                              {tr("session.shots")}
                            </span>
                            {result.scoring
                              ? " · " +
                                (result.scoring === "points"
                                  ? tr("details.fieldPoints")
                                  : tr("session.ordinaryScoring"))
                              : ""}
                          </span>
                          {result.stageTimeLimit !== undefined && (
                            <span className="subline">
                              {tr("session.stageTimeLimit")}:{" "}
                              {result.stageTimeLimit}
                              {" s"}
                            </span>
                          )}
                          {result.photoId && (
                            <PhotoViewer
                              src={"/api/photos/" + result.photoId + "/"}
                              label={result.label}
                            />
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{tr("session.points")}</dt>
                        <dd>
                          {points ?? "–"}
                          {result.elapsedSeconds !== undefined && (
                            <span className="subline">
                              {tr("session.elapsedSeconds")}:{" "}
                              {result.elapsedSeconds}
                              {" s"}
                            </span>
                          )}
                          {hitFactor(result, s.discipline) !== undefined && (
                            <span className="subline">
                              {tr("session.hitFactor")}:{" "}
                              {hitFactor(result, s.discipline)?.toFixed(4)}
                            </span>
                          )}
                          {result.matchPercent !== undefined && (
                            <span className="subline">
                              {result.matchPercent}%
                            </span>
                          )}
                          {result.placement !== undefined && (
                            <span className="subline">
                              {tr("session.placement")}: {result.placement}
                            </span>
                          )}
                          {result.dryFire && (
                            <span className="subline">
                              {tr("session.dryFire")}
                            </span>
                          )}
                          {result.scoreText && (
                            <span className="subline">{result.scoreText}</span>
                          )}
                          {result.status && result.status !== "completed" && (
                            <span className="subline">
                              {tr(`resultStatus.${result.status}`)}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{tr("details.hitsFigures")}</dt>
                        <dd>
                          {result.hits ?? "–"} / {result.figures ?? "–"}
                          {result.scoring === "points" && (
                            <span className="subline">
                              {(result.hits ?? 0) + (result.figures ?? 0)}{" "}
                              <span className="text-lowercase">
                                {tr("details.fieldPoints")}
                              </span>
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{tr("details.deductions")}</dt>
                        <dd>
                          {tr("details.penalties", {
                            points: result.penaltyPoints ?? 0,
                            seconds: result.penaltySeconds ?? 0,
                          })}
                        </dd>
                      </div>
                    </dl>
                    {a &&
                      (points === undefined ||
                        status === "not-evaluated" ||
                        status === "not-applicable") && (
                        <p>{localizeMessage(language, a.reason)}</p>
                      )}
                    {a && <AssessmentBasis assessment={a} showDate={false} />}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
        <p className="muted">{tr("print.netPoints")}</p>
        {s.notes && <p className="notes">{s.notes}</p>}
      </section>
      <BrowserWitnessPanel
        sessionId={id}
        results={s.results}
        signoffs={signoffs}
      />
      <SessionActions id={id} />
    </>
  );
}
