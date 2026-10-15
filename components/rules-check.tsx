"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import sources from "@/lib/rules/sources.json";
export function RulesCheck() {
  const { tr, locale } = useI18n();
  const [status, setStatus] = useState<"current" | "changed" | "unknown">(
    "unknown",
  );
  const [checkedAt, setCheckedAt] = useState("");
  const [busy, setBusy] = useState(false);
  async function check(signal?: AbortSignal) {
    setBusy(true);
    try {
      const response = await fetch("/api/rules/", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("unavailable");
      const value = await response.json();
      if (
        !["current", "changed", "unknown"].includes(value.status) ||
        typeof value.checkedAt !== "string"
      )
        throw new Error("invalid");
      setStatus(value.status);
      setCheckedAt(value.checkedAt);
    } catch {
      if (!signal?.aborted) {
        setStatus("unknown");
        setCheckedAt("");
      }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, []);
  return (
    <section className="card">
      <h2>{tr("resources.checkTitle")}</h2>
      <p>
        {tr("resources.bundled", {
          edition: sources.spsf.edition,
          year: sources.spsf.year,
        })}
      </p>
      <p role="status">{tr(`resources.${status}`)}</p>
      {checkedAt && (
        <p className="muted">
          {tr("resources.checked")}:{" "}
          {new Date(checkedAt).toLocaleString(locale)}
        </p>
      )}
      <p className="muted">{tr("resources.checkHelp")}</p>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void check()}
        >
          {tr("resources.check")}
        </button>
        <a
          href={sources.spsf.sourcePage}
          target="_blank"
          rel="noopener noreferrer"
        >
          {tr("resources.official")}
        </a>
      </div>
      {busy && <LoadingIndicator label={tr("resources.checking")} />}
    </section>
  );
}
