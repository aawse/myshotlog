"use client";
import { useI18n } from "../language-provider";
import { RulesCheck } from "../rules-check";
import sources from "@/lib/rules/sources.json";
export default function View() {
  const { tr, language } = useI18n();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("training.eyebrow")}</span>
          <h1>{tr("training.title")}</h1>
          <p>{tr("training.intro")}</p>
        </div>
      </div>
      <section className="card training-panel">
        <h2>{tr("resources.title")}</h2>
        <p>{tr("resources.intro")}</p>
        <ul>
          <li>
            <a
              href={sources.spsf.download}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tr("resources.spsf")}
            </a>
          </li>
          <li>
            <a
              href={sources.spsf.sourcePage}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tr("resources.official")}
            </a>
          </li>
          <li>
            <a href={sources.ipsc} target="_blank" rel="noopener noreferrer">
              {tr("resources.ipsc")}
            </a>
          </li>
          <li>
            <a href={sources.sdssf} target="_blank" rel="noopener noreferrer">
              {tr("resources.sdssf")}
            </a>
          </li>
          <li>
            <a
              href={sources.sdssfHandgun}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tr("resources.handgun")}
            </a>
          </li>
          <li>
            <a
              href={sources.nordicSteel}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tr("resources.steel")}
            </a>
          </li>
        </ul>
      </section>
      <RulesCheck />
      <section className="card training-panel">
        <h2>{tr("training.targets")}</h2>
        <p>{tr("training.targetHelp")}</p>
        <div className="actions">
          <a
            className="button secondary"
            href={`/training/aiming-dots-${language}.pdf`}
            download
          >
            {tr("training.dots")}
          </a>
          <a
            className="button secondary"
            href={`/training/alignment-grid-${language}.pdf`}
            download
          >
            {tr("training.grid")}
          </a>
        </div>
      </section>
      <section className="card training-panel">
        <h2>{tr("training.dryTitle")}</h2>
        <p>{tr("training.dryIntro")}</p>
        <ol>
          {(["safe", "prepare", "observe", "finish"] as const).map((key) => (
            <li key={key}>{tr(`training.${key}`)}</li>
          ))}
        </ol>
        <p className="muted">{tr("training.record")}</p>
      </section>
    </>
  );
}
