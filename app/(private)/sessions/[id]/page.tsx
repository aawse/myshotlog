import { localizeMessage } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
import { PhotoViewer } from "@/components/photo-viewer";
import { Medal, CircleX, CircleHelp } from "lucide-react";
import { notFound } from "next/navigation";
import { authenticated } from "@/lib/auth/server";
import { ownerWitnessStore } from "@/lib/witness/server";
import { witnessCurrent } from "@/lib/witness/model";
import { WitnessPanel } from "@/components/witness-panel";
import { records } from "@/lib/data";
import { disciplineName, targetName, caliberName } from "@/lib/i18n-domain";
import { summarize } from "@/lib/rules/engine";
import { SessionPrint } from "@/components/session-print";
import { SessionActions } from "@/components/session-actions";
export default async function Page({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { tr, language } = await getI18n();

  const { id } = await params;
  const labels = {
    "not-applicable": tr("assessment.notApplicable"),
    "not-evaluated": tr("assessment.notEvaluated"),
  };
  const data = await records();
  const s = data.sessions.find((s) => s.id === id);
  if (!s) notFound();
  const { user } = await authenticated();
  const invitations = await (await ownerWitnessStore(user)).invitations(id);
  const signoffs = (data.witnessSignoffs ?? [])
    .filter((w) => w.sessionId === id)
    .sort((a, b) => b.signedAt.localeCompare(a.signedAt))
    .map((w) => ({ ...w, current: witnessCurrent(w, s) }));
  const total = summarize(s);
  const assessments = data.assessments.filter((a) => a.sessionId === id);
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
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr("details.seriesStage")}</th>
                <th>{tr("session.points")}</th>
                <th>{tr("details.hitsFigures")}</th>
                <th>{tr("details.deductions")}</th>
              </tr>
            </thead>
            <tbody>
              {s.results.map((r) => {
                const medal = (["gold", "silver", "bronze"] as const).find(
                  (level) =>
                    assessments
                      .filter(
                        (a) =>
                          a.resultId === r.id &&
                          a.revision === s.revision &&
                          a.level === level,
                      )
                      .at(-1)?.status === "met",
                );
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
                        {assessments.find((a) => a.resultId === r.id)
                          ?.ruleVersion ?? tr("details.notRecorded")}
                      </span>
                      {r.photoId && (
                        <PhotoViewer
                          src={"/api/photos/" + r.photoId + "/"}
                          label={r.label}
                        />
                      )}
                    </td>
                    <td>{r.points ?? "–"}</td>
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
        {s.notes && <p className="notes">{s.notes}</p>}
      </section>
      <WitnessPanel
        sessionId={id}
        results={s.results}
        signoffs={signoffs}
        invitations={invitations}
      />
      <section className="card">
        <h2>{tr("details.assessments")}</h2>
        <p className="muted">{tr("details.assessmentHelp")}</p>
        {assessments.length ? (
          assessments.map((a) => {
            const result = s.results.find((r) => r.id === a.resultId);
            const points =
              result?.points === undefined
                ? undefined
                : result.points - (result.penaltyPoints ?? 0);
            return (
              <div className="assessment" key={a.id}>
                {(a.status === "not-evaluated" ||
                  a.status === "not-applicable") && (
                  <span className="pill">{labels[a.status]}</span>
                )}
                <strong>
                  <span className="calculation-grade">
                    {a.status === "met" ? (
                      <span
                        className={`series-medal ${a.level}`}
                        role="img"
                        aria-label={tr("details.medalSeries", {
                          level: tr(`level.${a.level}`),
                        })}
                      >
                        <Medal size={20} aria-hidden="true" />
                      </span>
                    ) : a.status === "not-met" ? (
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
                    {tr(`level.${a.level}`)}
                  </span>{" "}
                  ·{" "}
                  {s.results.find((r) => r.id === a.resultId)?.label ??
                    tr("details.previousResult")}{" "}
                  {tr("details.revision")} {a.revision}
                </strong>
                <p>
                  {points === undefined
                    ? localizeMessage(language, a.reason)
                    : tr("quick.points", { p0: points })}
                </p>
                {points !== undefined &&
                  (a.status === "not-evaluated" ||
                    a.status === "not-applicable") && (
                    <p>{localizeMessage(language, a.reason)}</p>
                  )}
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
              </div>
            );
          })
        ) : (
          <p>{tr("details.empty")}</p>
        )}
        <SessionActions id={id} />
      </section>
    </>
  );
}
