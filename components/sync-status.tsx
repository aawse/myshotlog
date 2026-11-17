"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud, CloudUpload, WifiOff, TriangleAlert, X } from "lucide-react";
import { useI18n } from "./language-provider";
import { useJournal, useJournalState } from "./journal-provider";
import {
  dependentIds,
  MAX_LOCAL_BYTES,
  type SyncIssue,
} from "@/lib/sync/storage";
import type { MessageKey } from "@/lib/i18n";
import { SyncComparison } from "./sync-comparison";
export function SyncStatus() {
  const provider = useJournal(),
    { state, status, error, failures } = useJournalState(),
    { tr, language } = useI18n();
  const [actionError, setActionError] = useState<MessageKey>(),
    [resolving, setResolving] = useState(false),
    [confirmation, setConfirmation] = useState<{
      issue: SyncIssue;
      keep: boolean;
      count: number;
    }>();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const modal = dialog.current;
    if (open && modal && !modal.open) modal.showModal();
    else if (!open && modal?.open) modal.close();
  }, [open]);
  useEffect(() => {
    if (confirmation) confirmButton.current?.focus();
  }, [confirmation]);
  if (!provider) throw new Error("JournalProvider required");
  const journal = provider;
  const conflict = state.conflict;
  const operation = state.pending.find((o) => o.id === conflict?.id);
  const count = operation ? dependentIds(state.pending, operation.id).size : 0;
  const choice =
    confirmation?.issue.id === operation?.id ? confirmation : undefined;
  const recoveryMessage =
    conflict?.reason === "size"
      ? "sync.sizeHelp"
      : conflict?.reason === "invalid"
        ? "sync.rejectedHelp"
        : conflict?.reason === "dependency"
          ? "sync.dependencyHelp"
          : conflict?.reason === "photo"
            ? "sync.photoHelp"
            : "sync.conflictHelp";
  const labels = {
    loading: "loading.journal",
    synced: "sync.synced",
    pending: "sync.pending",
    syncing: "sync.syncing",
    offline: "sync.offline",
    conflict: "sync.conflict",
    authentication: "sync.authentication",
    error: "sync.failed",
    storage: "sync.storageError",
  } as const;
  const compactLabels = {
    loading: "sync.compactLoading",
    synced: "sync.compactSynced",
    pending: "sync.compactPending",
    syncing: "sync.compactSyncing",
    offline: "sync.compactOffline",
    conflict: "sync.compactAttention",
    authentication: "sync.compactAuthentication",
    error: "sync.compactAttention",
    storage: "sync.compactAttention",
  } as const;
  const attention = ["error", "conflict", "storage", "authentication"].includes(
    status,
  );
  const message = tr(
    status === "offline" || status === "conflict"
      ? labels[status]
      : (error ?? labels[status]),
    { count: state.pending.length },
  );
  const Icon =
    status === "synced"
      ? Cloud
      : status === "offline"
        ? WifiOff
        : attention
          ? TriangleAlert
          : CloudUpload;
  function backup() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "myshotlog-pending",
              version: 1,
              scope: state.scope,
              operations: state.pending,
              photos: state.photos,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "myshotlog-pending.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function resolve() {
    if (!choice) return;
    setResolving(true);
    setActionError(undefined);
    try {
      await journal.resolve(choice.issue, choice.keep, choice.count);
    } catch (error) {
      setActionError(
        error instanceof Error &&
          (error.message === "sync.reviewChanged" ||
            error.message === "sync.missingDependency" ||
            error.message === "sync.storageError")
          ? error.message
          : "sync.resolveFailed",
      );
    } finally {
      setResolving(false);
      setConfirmation(undefined);
      requestAnimationFrame(() => {
        if (!dialog.current?.open) return;
        const control = dialog.current.querySelector<HTMLButtonElement>(
          ".sync-choice, .sync-retry:not(:disabled)",
        );
        control?.focus();
      });
    }
  }
  return (
    <div className="sync-control">
      <button
        ref={trigger}
        type="button"
        className={
          "journal-tool-button sync-trigger" +
          (attention ? " sync-attention" : "")
        }
        aria-label={tr("sync.heading") + ": " + message}
        title={message}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon size={20} aria-hidden="true" />
        <span aria-hidden="true">
          {tr(compactLabels[status], { count: state.pending.length })}
        </span>
      </button>
      <span className="visually-hidden" role="status">
        {message}
      </span>
      <dialog
        ref={dialog}
        className="sync-dialog"
        aria-labelledby="sync-heading"
        onClose={() => {
          setOpen(false);
          setConfirmation(undefined);
          setActionError(undefined);
          trigger.current?.focus({ preventScroll: true });
        }}
      >
        <header className="sync-dialog-header">
          <h2 id="sync-heading">{tr("sync.heading")}</h2>
          <button
            type="button"
            className="secondary"
            aria-label={tr("common.close")}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <p className="sync-message">
          <Icon size={20} aria-hidden="true" />
          {message}
        </p>
        {status === "offline" && <p>{tr("sync.offlineHelp")}</p>}
        {status === "authentication" && (
          <p>
            <a className="button" href="/login/">
              {tr("login.return")}
            </a>
          </p>
        )}
        <div className="sync-line">
          <button
            type="button"
            className="text-button sync-retry"
            disabled={
              status === "syncing" ||
              status === "loading" ||
              status === "offline" ||
              Boolean(choice) ||
              resolving
            }
            onClick={async () => {
              setActionError(undefined);
              setResolving(true);
              try {
                await journal.sync(operation?.id);
              } finally {
                setResolving(false);
              }
            }}
          >
            {tr(operation ? "sync.checkAgain" : "sync.now")}
          </button>
          {state.pending.length > 0 && (
            <button type="button" className="text-button" onClick={backup}>
              {tr("sync.backup")}
            </button>
          )}
        </div>
        {state.pending.length > 0 && !operation && (
          <p className="muted">{tr("sync.pendingHelp")}</p>
        )}
        {operation && conflict && (
          <div className="sync-conflict">
            <p>{tr(recoveryMessage)}</p>
            <SyncComparison operation={operation} current={conflict.current} />
            {choice ? (
              <div>
                <p id="sync-confirm-detail">
                  {choice.keep
                    ? tr("sync.confirmDeviceHelp")
                    : tr("sync.confirmDiscardHelp", { count: choice.count })}
                </p>
                <div className="actions sync-actions">
                  <button
                    ref={confirmButton}
                    type="button"
                    disabled={resolving}
                    aria-describedby="sync-confirm-detail"
                    onClick={() => void resolve()}
                  >
                    {tr(
                      choice.keep
                        ? "sync.confirmDevice"
                        : "sync.confirmDiscard",
                    )}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={resolving}
                    onClick={() => {
                      setConfirmation(undefined);
                      requestAnimationFrame(() =>
                        dialog.current
                          ?.querySelector<HTMLButtonElement>(".sync-choice")
                          ?.focus(),
                      );
                    }}
                  >
                    {tr("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions sync-actions">
                {!conflict.reason && (
                  <button
                    type="button"
                    className="sync-choice"
                    disabled={resolving || status === "syncing"}
                    onClick={() => {
                      setActionError(undefined);
                      setConfirmation({ issue: conflict, keep: true, count });
                    }}
                  >
                    {tr("sync.keepDevice")}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary sync-choice"
                  disabled={resolving || status === "syncing"}
                  onClick={() => {
                    setActionError(undefined);
                    setConfirmation({ issue: conflict, keep: false, count });
                  }}
                >
                  {conflict.reason
                    ? tr("sync.discardRejected", { count })
                    : tr("sync.keepServer", { count })}
                </button>
              </div>
            )}
            {!choice && !conflict.reason && (
              <p className="muted">{tr("sync.manualHelp")}</p>
            )}
          </div>
        )}
        {actionError && <p role="alert">{tr(actionError)}</p>}
        {failures.length > 0 && (
          <details className="sync-history">
            <summary>{tr("sync.history")}</summary>
            <ol>
              {failures.map((failure, index) => (
                <li key={failures.length - index}>
                  <time dateTime={failure.at}>
                    {new Intl.DateTimeFormat(language, {
                      dateStyle: "short",
                      timeStyle: "medium",
                    }).format(new Date(failure.at))}
                  </time>
                  <p>
                    {tr(
                      failure.stage === "read"
                        ? "sync.stageRead"
                        : failure.stage === "upload"
                          ? "sync.stageUpload"
                          : "sync.stageStorage",
                    )}
                    {failure.httpStatus !== undefined &&
                      ` · HTTP ${failure.httpStatus}`}
                    {failure.uploadCount !== undefined &&
                      ` · ${tr("sync.uploadCount", { count: failure.uploadCount })}`}
                  </p>
                  <p>{tr(failure.reason)}</p>
                </li>
              ))}
            </ol>
          </details>
        )}
        <details className="sync-options">
          <summary>{tr("sync.browserOptions")}</summary>
          <p>{tr("sync.browserHelp")}</p>
          <button
            className="text-button"
            type="button"
            onClick={() => restore.current?.click()}
          >
            {tr("sync.restore")}
          </button>
          <input
            ref={restore}
            className="photo-file-input"
            aria-label={tr("sync.restore")}
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setActionError(undefined);
              try {
                if (file.size > MAX_LOCAL_BYTES) throw new Error();
                await journal.restore(JSON.parse(await file.text()));
              } catch {
                setActionError("sync.restoreFailed");
              }
            }}
          />
        </details>
      </dialog>
    </div>
  );
}
