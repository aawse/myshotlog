"use client";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useI18n } from "./language-provider";
import { useUpdates } from "./update-provider";
import { LoadingIndicator } from "./loading-indicator";
export function UpdateNotice() {
  const { tr } = useI18n();
  const { status, ready } = useUpdates();
  if (!ready && (!status?.configured || !status.upstreamAhead)) return null;
  return (
    <aside className="update-notice" aria-live="polite">
      <RefreshCw size={18} aria-hidden="true" />
      <span>
        {tr(
          ready
            ? "updates.ready"
            : status?.forkAhead === 0
              ? "updates.pending"
              : "updates.available",
        )}
      </span>
      {ready ? (
        <button
          type="button"
          className="secondary"
          onClick={() => location.reload()}
        >
          {tr("updates.reload")}
        </button>
      ) : (
        <Link href="/settings/#updates" className="button secondary">
          {tr("updates.review")}
        </Link>
      )}
    </aside>
  );
}
export function AppUpdates() {
  const { tr } = useI18n();
  const { status, error, checking, syncing, synced, ready, refresh, sync } =
    useUpdates();
  const blockKeys = {
    configuration: "updates.configuration",
    token: "updates.tokenHelp",
    owner: "updates.ownerHelp",
    preview: "updates.previewHelp",
    fork: "updates.forkHelp",
  } as const;
  return (
    <section className="card update-panel" id="updates">
      <h2>{tr("updates.heading")}</h2>
      <p className="muted">{tr("updates.help")}</p>
      {status?.configured ? (
        <>
          <p>
            {tr("updates.source", {
              repository: status.repository ?? "",
              branch: status.branch ?? "",
            })}
          </p>
          <p className="muted">
            {tr("updates.version", {
              version: status.deployedSha?.slice(0, 7) ?? "",
            })}
          </p>
          <p role="status">
            {tr(
              ready
                ? "updates.ready"
                : status.upstreamAhead > 0
                  ? status.forkAhead === 0
                    ? "updates.pending"
                    : "updates.behind"
                  : "updates.current",
              { count: status.upstreamAhead },
            )}
          </p>
          {status.commits.length > 0 && (
            <>
              <h3>{tr("updates.changes")}</h3>
              <ul className="update-changes">
                {status.commits.map((commit) => (
                  <li key={commit.sha}>
                    <code>{commit.sha.slice(0, 7)}</code> {commit.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        status && <p>{tr("updates.configuration")}</p>
      )}
      {status?.block && status.configured && (
        <p className="muted">{tr(blockKeys[status.block])}</p>
      )}
      {synced && !ready && <p role="status">{tr("updates.synced")}</p>}
      <div className="actions">
        <button
          type="button"
          className="secondary"
          disabled={checking || syncing}
          aria-label={tr(checking ? "updates.checking" : "updates.check")}
          onClick={() => refresh()}
        >
          {checking ? (
            <LoadingIndicator label={tr("updates.checking")} />
          ) : (
            tr("updates.check")
          )}
        </button>
        {status?.canSync && status.forkAhead > 0 && (
          <button
            type="button"
            disabled={checking || syncing}
            aria-label={tr(syncing ? "updates.syncing" : "updates.sync")}
            onClick={() => sync()}
          >
            {syncing ? (
              <LoadingIndicator label={tr("updates.syncing")} />
            ) : (
              tr("updates.sync")
            )}
          </button>
        )}
        {ready && (
          <button type="button" onClick={() => location.reload()}>
            {tr("updates.reload")}
          </button>
        )}
      </div>
      <p className="small muted">
        <a
          href="https://github.com/aawse/myshotlog/blob/main/docs/UPDATES.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {tr("updates.guide")}
        </a>
      </p>
      {error && (
        <p className="danger" role="alert">
          {tr(error)}
        </p>
      )}
    </section>
  );
}
