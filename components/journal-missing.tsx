"use client";
import { useI18n } from "./language-provider";
export function JournalMissing() {
  const { tr } = useI18n();
  return (
    <section className="card">
      <h1>{tr("error.loadHeading")}</h1>
      <p>{tr("journal.missingRecord")}</p>
      <a className="button secondary" href="/sessions/">
        {tr("nav.sessions")}
      </a>
    </section>
  );
}
