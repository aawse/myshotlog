import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
import { Target } from "lucide-react";
import { disciplineName, caliberName } from "@/lib/i18n-domain";
import { records } from "@/lib/data";
export default async function Page() {
  const { tr, language } = await getI18n();

  const data = await records();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("firearm.eyebrow")}</span>
          <h1>{tr("nav.firearms")}</h1>
          <p>{tr("firearm.listHelp")}</p>
        </div>
        <Link className="button" href="/firearms/new/">
          {tr("firearm.addLink")}
        </Link>
      </div>
      <div className="firearm-grid">
        {data.firearms.map((f) => (
          <Link
            className="card firearm-card"
            key={f.id}
            href={"/firearms/" + f.id + "/"}
          >
            <Target size={32} />
            <span className="pill">
              {f.archived ? tr("firearm.archived") : tr("firearm.active")} ·{" "}
              {f.group}
            </span>
            <h2>{f.nickname || f.make + " " + f.model}</h2>
            <p>
              {f.make} {f.model} · {caliberName(language, f.caliber)}
            </p>
            {f.defaultDiscipline && (
              <p className="muted">
                {tr("firearm.defaultSportPrefix")}{" "}
                {disciplineName(language, f.defaultDiscipline)}
              </p>
            )}
            <span className="inline-link">{tr("firearm.editLink")}</span>
          </Link>
        ))}
      </div>
      {!data.firearms.length && (
        <section className="card empty">
          <h2>{tr("firearm.emptyHeading")}</h2>
          <p>{tr("firearm.emptyHelp")}</p>
        </section>
      )}
    </>
  );
}
