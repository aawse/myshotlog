import Link from "next/link";
import Image from "next/image";
import { Medal } from "lucide-react";
import { targetLabel } from "@/lib/options";
import { notFound } from "next/navigation";
import { records } from "@/lib/data";
import { discipline } from "@/lib/disciplines";
import { summarize } from "@/lib/rules/engine";
import { levelLabels } from "@/lib/rules/catalog";
import { SessionActions } from "@/components/session-actions";
const labels = {
  "not-applicable": "Ej tillämpligt",
  "not-evaluated": "Ej bedömt",
  "not-met": "Kraven ej uppfyllda",
  met: "Delprestation uppfylld",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await records();
  const s = data.sessions.find((s) => s.id === id);
  if (!s) notFound();
  const total = summarize(s);
  const assessments = data.assessments.filter((a) => a.sessionId === id);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {s.date} · {s.location || "Ingen plats"}
          </span>
          <h1>{discipline(s.discipline).name}</h1>
          <p>
            {s.program} · {s.context === "practice" ? "Träning" : "Tävling"} ·
            revision {s.revision}
          </p>
        </div>
        <Link className="button secondary" href={"/sessions/" + id + "/edit"}>
          Redigera pass
        </Link>
      </div>
      <section className="card">
        <h2>
          {s.firearmSnapshot
            ? s.firearmSnapshot.nickname ||
              s.firearmSnapshot.make + " " + s.firearmSnapshot.model
            : "Lånat vapen"}
          {s.firearmSnapshot && <> · {s.firearmSnapshot.caliber}</>}
        </h2>
        <p>
          Vapengrupp {s.group} · {total.shots} skott · {s.results.length} poster
        </p>
        {(s.distance !== undefined || s.target !== undefined) && (
          <p>
            Avstånd:{" "}
            {s.distance !== null && s.distance !== undefined
              ? s.distance + " m"
              : "Ej angivet"}{" "}
            · Måltyp: {targetLabel(s.target)}
          </p>
        )}
        <p>
          Skjuttid:{" "}
          {s.seconds !== null && s.seconds !== undefined
            ? s.seconds + " s"
            : s.results.some((r) => r.seconds !== undefined)
              ? "Varierande äldre tider"
              : "Ej angiven"}
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Serie / station</th>
                <th>Poäng</th>
                <th>Träffar / figurer</th>
                <th>Avdrag</th>
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
                            aria-label={levelLabels[medal] + "serie"}
                            title={levelLabels[medal] + "serie"}
                          >
                            <Medal size={20} aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="subline">
                        {r.shots} skott
                        {r.scoring
                          ? " · " +
                            (r.scoring === "points"
                              ? "Poängfält"
                              : "Vanlig räkning")
                          : ""}
                      </span>
                      <span className="subline">
                        Regelversion:{" "}
                        {assessments.find((a) => a.resultId === r.id)
                          ?.ruleVersion ?? "Ej registrerad"}
                      </span>
                      {r.photoId && (
                        <a
                          href={"/api/photos/" + r.photoId}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={"Öppna foto av tavlan för " + r.label}
                        >
                          <Image
                            className="series-target-photo"
                            src={"/api/photos/" + r.photoId}
                            alt="Foto av tavlan"
                            width={120}
                            height={90}
                            unoptimized
                          />
                        </a>
                      )}
                    </td>
                    <td>{r.points ?? "–"}</td>
                    <td>
                      {r.hits ?? "–"} / {r.figures ?? "–"}
                      {r.scoring === "points" && (
                        <span className="subline">
                          {(r.hits ?? 0) + (r.figures ?? 0)} fältpoäng
                        </span>
                      )}
                    </td>
                    <td>
                      {r.penaltyPoints ?? 0} p / {r.penaltySeconds ?? 0} s
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {s.notes && <p className="notes">{s.notes}</p>}
      </section>
      <section className="card">
        <h2>Serieberäkningar</h2>
        <p className="muted">
          Beräknat från seriens resultat med regelversionen för passets datum.
        </p>
        {assessments.length ? (
          assessments.map((a) => (
            <div className="assessment" key={a.id}>
              <span className={"pill " + (a.status === "met" ? "success" : "")}>
                {labels[a.status]}
              </span>
              <strong>
                {levelLabels[a.level]} ·{" "}
                {s.results.find((r) => r.id === a.resultId)?.label ??
                  "Tidigare resultat"}{" "}
                · revision {a.revision}
              </strong>
              <p>{a.reason}</p>
              <small>
                {a.ruleVersion} · {a.createdAt.slice(0, 10)}
              </small>
              {a.source && <p className="muted">{a.source}</p>}
              <details>
                <summary>Visa sparat bedömningsunderlag</summary>
                <pre>{JSON.stringify(a.input, null, 2)}</pre>
              </details>
            </div>
          ))
        ) : (
          <p>Inga serieresultat att beräkna.</p>
        )}
        <SessionActions id={id} />
      </section>
    </>
  );
}
