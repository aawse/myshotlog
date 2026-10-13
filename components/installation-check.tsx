"use client";
import { useState, useRef } from "react";
import { CircleCheck, TriangleAlert, CircleX } from "lucide-react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import type { InstallationReport } from "@/lib/installation/check";
import type { MessageKey } from "@/lib/i18n";
export function InstallationCheck() {
  const { tr } = useI18n();
  const [report, setReport] = useState<InstallationReport>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<MessageKey>();
  const running = useRef(false);
  async function check() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    setReport(undefined);
    try {
      const response = await fetch("/api/installation/", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(
          data.error === "signIn"
            ? "api.signIn"
            : data.error === "rateLimited"
              ? "updates.rateLimited"
              : "installation.failed",
        );
        return;
      }
      setReport(data);
    } catch {
      setError("installation.failed");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card update-panel" id="installation">
      <h2>{tr("installation.heading")}</h2>
      <p className="muted">{tr("installation.help")}</p>
      <button
        type="button"
        className="secondary"
        onClick={check}
        disabled={busy}
        aria-label={tr(busy ? "installation.checking" : "installation.check")}
      >
        {busy ? (
          <LoadingIndicator label={tr("installation.checking")} />
        ) : (
          tr("installation.check")
        )}
      </button>
      {error && <p role="alert">{tr(error)}</p>}
      {report && (
        <>
          <p role="status">
            {tr(
              report.checks.some((c) => c.status === "error")
                ? "installation.errors"
                : "installation.completed",
            )}
          </p>
          <ul className="installation-checks">
            {report.checks.map((item) => {
              const Icon =
                item.status === "ok"
                  ? CircleCheck
                  : item.status === "error"
                    ? CircleX
                    : TriangleAlert;
              return (
                <li
                  key={item.id}
                  className={`installation-result installation-${item.status}`}
                >
                  <Icon size={20} aria-hidden="true" />
                  <div>
                    <strong>{tr(item.label)}</strong>
                    <span className="muted">
                      {" "}
                      —{" "}
                      {tr(
                        item.status === "ok"
                          ? "installation.ok"
                          : item.status === "error"
                            ? "installation.error"
                            : "installation.review",
                      )}
                    </span>
                    <p>{tr(item.message)}</p>
                    {item.variables && item.variables.length > 0 && (
                      <p>
                        {item.variables.map((name, index) => (
                          <span key={name}>
                            {index > 0 && ", "}
                            <code>{name}</code>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p>
        <a
          href="https://github.com/aawse/myshotlog/blob/main/docs/SETUP.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {tr("installation.guide")}
        </a>
      </p>
    </section>
  );
}
