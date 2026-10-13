"use client";
import { useI18n } from "./language-provider";
import { caliberName, disciplineName, targetName } from "@/lib/i18n-domain";
import type { WitnessReview } from "@/lib/witness/model";
export function WitnessReviewView({ review }: { review: WitnessReview }) {
  const { tr, language } = useI18n();
  return (
    <div className="witness-review">
      <h2>
        {disciplineName(language, review.discipline)} · {review.program}
      </h2>
      <p>
        {review.date} {review.time} ·{" "}
        {review.location || tr("common.noLocation")}
      </p>
      <p>
        {review.context === "practice"
          ? tr("session.practice")
          : tr("session.competition")}{" "}
        · {tr("sessions.groupPrefix")} {review.group}
      </p>
      <p>
        {review.firearm
          ? `${review.firearm.make} ${review.firearm.model} · ${caliberName(language, review.firearm.caliber)}`
          : tr("common.borrowedFirearm")}
      </p>
      {review.results.map((result) => (
        <section className="witness-result" key={result.id}>
          <h3>{result.label}</h3>
          <dl>
            <div>
              <dt>{tr("session.shots")}</dt>
              <dd>{result.shots}</dd>
            </div>
            {result.points !== undefined && (
              <div>
                <dt>{tr("session.points")}</dt>
                <dd>{result.points}</dd>
              </div>
            )}
            {result.hits !== undefined && (
              <div>
                <dt>{tr("details.hitsFigures")}</dt>
                <dd>
                  {result.hits} / {result.figures ?? "–"}
                </dd>
              </div>
            )}
            {result.x !== undefined && (
              <div>
                <dt>{tr("session.innerTens")}</dt>
                <dd>{result.x}</dd>
              </div>
            )}
            <div>
              <dt>{tr("details.distance")}</dt>
              <dd>
                {result.distance === undefined
                  ? tr("common.notSpecified")
                  : `${result.distance} m`}
              </dd>
            </div>
            <div>
              <dt>{tr("details.target")}</dt>
              <dd>{targetName(language, result.target)}</dd>
            </div>
            <div>
              <dt>{tr("details.time")}</dt>
              <dd>
                {result.seconds === undefined
                  ? tr("common.notSpecified")
                  : `${result.seconds} s`}
              </dd>
            </div>
            {result.scoring && (
              <div>
                <dt>{tr("session.scoring")}</dt>
                <dd>
                  {result.scoring === "points"
                    ? tr("details.fieldPoints")
                    : tr("session.ordinaryScoring")}
                </dd>
              </div>
            )}
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
        </section>
      ))}
    </div>
  );
}
