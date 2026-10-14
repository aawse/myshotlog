"use client";
import { useRef, useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import type { RepositoryAccessReport } from "@/lib/security/repository-access";
import type { MessageKey } from "@/lib/i18n";
export function RepositoryAccess() {
  const { tr } = useI18n();
  const [report, setReport] = useState<RepositoryAccessReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey>();
  const running = useRef(false);
  async function inspect() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setReport(undefined);
    setError(undefined);
    try {
      const response = await fetch("/api/repository-access/", {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? "api.signIn"
            : response.status === 429
              ? "updates.rateLimited"
              : "access.unavailable",
        );
      } else setReport(await response.json());
    } catch {
      setError("access.unavailable");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="card update-panel"
      id="repository-access"
      aria-busy={busy}
    >
      <h2>{tr("access.heading")}</h2>
      <p className="muted">{tr("access.help")}</p>
      <button
        type="button"
        className="secondary"
        onClick={inspect}
        disabled={busy}
        aria-label={tr(busy ? "access.checking" : "access.check")}
      >
        {busy ? (
          <LoadingIndicator label={tr("access.checking")} />
        ) : (
          tr("access.check")
        )}
      </button>
      {error && <p role="alert">{tr(error)}</p>}
      {report && (
        <>
          <p role="status">{tr(`access.${report.status}`)}</p>
          {report.repository && (
            <p>
              <strong>{report.repository}</strong>
            </p>
          )}
          {report.visibility && (
            <p
              className={`installation-result installation-${report.visibility === "private" ? "ok" : "error"}`}
            >
              {report.visibility === "private" ? (
                <ShieldCheck size={20} aria-hidden="true" />
              ) : (
                <TriangleAlert size={20} aria-hidden="true" />
              )}
              {tr(`access.${report.visibility}`)}
            </p>
          )}
          {report.issue &&
            !(
              report.issue === "unavailable" && report.status === "unavailable"
            ) && (
              <p role="alert">
                {tr(
                  report.issue === "rateLimited"
                    ? "access.providerRateLimited"
                    : `access.${report.issue}`,
                )}
              </p>
            )}
          {report.accounts.length > 0 && (
            <ul className="repository-accounts">
              {report.accounts.map((account) => (
                <li key={account.id}>
                  <div>
                    <strong>{account.login}</strong>
                    {account.bot && <span> · {tr("access.bot")}</span>}
                    <small className="muted">
                      {tr("access.numericId", { id: account.id })}
                    </small>
                  </div>
                  <span>
                    {tr(`access.role.${account.role}`)}
                    {account.customRole && <> · {account.customRole}</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.organization && (
            <p className="muted">{tr("access.organization")}</p>
          )}
          {report.accessUrl && (
            <p>
              <a
                href={report.accessUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {tr("access.manage")}
              </a>
            </p>
          )}
        </>
      )}
      <p className="muted">{tr("access.limits")}</p>
    </section>
  );
}
