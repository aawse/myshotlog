"use client";
import { useI18n } from "@/components/language-provider";
export default function Error({ reset }: { reset: () => void }) {
  const { tr } = useI18n();

  return (
    <section className="card">
      <h1>{tr("error.loadHeading")}</h1>
      <p>{tr("error.loadHelp")}</p>
      <button onClick={reset}>{tr("error.retry")}</button>
    </section>
  );
}
