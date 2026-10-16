"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud, CloudUpload, WifiOff, TriangleAlert, X } from "lucide-react";
import { useI18n } from "./language-provider";
import { useJournal, useJournalState } from "./journal-provider";
import { dependentIds, MAX_LOCAL_BYTES } from "@/lib/sync/storage";
import type { MessageKey } from "@/lib/i18n";
export function SyncStatus() {
  const provider = useJournal(),
    { state, status, error } = useJournalState(),
    { tr } = useI18n();
  const [failed, setFailed] = useState(false),
    [resolving, setResolving] = useState(false);
  const restore = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const modal = dialog.current;
    if (open && modal && !modal.open) modal.showModal();
    else if (!open && modal?.open) modal.close();
  }, [open]);
  if (!provider) throw new Error("JournalProvider required");
  const journal = provider;
  const operation = state.pending.find((o) => o.id === state.conflict?.id);
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
  const message = tr(labels[status], { count: state.pending.length });
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
  async function resolve(keep: boolean) {
    setResolving(true);
    setFailed(false);
    try {
      await journal.resolve(keep);
    } catch {
      setFailed(true);
    } finally {
      setResolving(false);
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
            className="text-button"
            disabled={status === "syncing" || status === "loading" || resolving}
            onClick={() => void journal.sync()}
          >
            {tr("sync.now")}
          </button>
          {state.pending.length > 0 && (
            <button type="button" className="text-button" onClick={backup}>
              {tr("sync.backup")}
            </button>
          )}
        </div>
        {error && error !== labels[status] && error.startsWith("sync.") && (
          <p role="alert">{tr(error as MessageKey)}</p>
        )}
        {state.pending.length > 0 && (
          <p className="muted">{tr("sync.pendingHelp")}</p>
        )}
        {operation && state.conflict && (
          <div className="sync-conflict">
            <p>{tr("sync.conflictHelp")}</p>
            <details>
              <summary>{tr("sync.compare")}</summary>
              <div className="sync-comparison">
                <div>
                  <h3>{tr("sync.deviceVersion")}</h3>
                  <pre>{JSON.stringify(operation.payload, null, 2)}</pre>
                </div>
                <div>
                  <h3>{tr("sync.serverVersion")}</h3>
                  <pre>
                    {JSON.stringify(
                      state.conflict.current.map((t) => t.value),
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
            </details>
            <div className="actions">
              <button
                type="button"
                disabled={resolving}
                onClick={() => void resolve(true)}
              >
                {tr("sync.keepDevice")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={resolving}
                onClick={() => void resolve(false)}
              >
                {tr("sync.keepServer", {
                  count: dependentIds(state.pending, operation.id).size,
                })}
              </button>
            </div>
          </div>
        )}
        {failed && <p role="alert">{tr("sync.resolveFailed")}</p>}
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
              setFailed(false);
              try {
                if (file.size > MAX_LOCAL_BYTES) throw new Error();
                await journal.restore(JSON.parse(await file.text()));
              } catch {
                setFailed(true);
              }
            }}
          />
        </details>
      </dialog>
    </div>
  );
}
