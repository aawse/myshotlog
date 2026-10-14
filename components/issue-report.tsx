"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X, Copy } from "lucide-react";
import { translator, type Language } from "@/lib/i18n";
import {
  browserFamily,
  issueDraft,
  issueRepository,
  type IssueFields,
} from "@/lib/issues";
export function IssueReport({
  open,
  onClose,
  pageLanguage,
}: {
  open: boolean;
  onClose: () => void;
  pageLanguage: Language;
}) {
  const { tr, language } = translator(pageLanguage);
  const dialog = useRef<HTMLDialogElement>(null);
  const initialized = useRef(false);
  const reportArea = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState<IssueFields>({
    kind: "bug",
    title: "",
    description: "",
    steps: "",
    expected: "",
    environment: "",
    additional: "",
  });
  const [prepared, setPrepared] = useState<ReturnType<typeof issueDraft>>(),
    [copied, setCopied] = useState(false),
    [copyFailed, setCopyFailed] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (!initialized.current) {
      initialized.current = true;
      setFields((previous) => ({
        ...previous,
        environment: [
          process.env.MYSHOTLOG_BUILD_COMMIT
            ? tr("updates.version", {
                version: process.env.MYSHOTLOG_BUILD_COMMIT.slice(0, 7),
              })
            : "",
          browserFamily(navigator.userAgent),
        ]
          .filter(Boolean)
          .join("\n"),
      }));
    }
    const modal = dialog.current;
    modal?.showModal();
    return () => {
      if (modal?.open) modal.close();
    };
  }, [open]);
  function change(key: keyof IssueFields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setPrepared(undefined);
    setCopied(false);
    setCopyFailed(false);
    setError(false);
  }
  return (
    <>
      <dialog
        ref={dialog}
        onClose={onClose}
        className="issue-dialog"
        aria-labelledby="issue-heading"
        aria-describedby="issue-help"
      >
        <header className="issue-dialog-header">
          <h2 id="issue-heading">{tr("issues.heading")}</h2>
          <button
            type="button"
            className="secondary"
            aria-label={tr("common.close")}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <p className="muted">{tr("issues.intro")}</p>
        <p className="small">
          <a
            href={issueRepository + "/issues"}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("issues.existing")}
          </a>
        </p>
        <p id="issue-help" className="muted">
          {tr("issues.detailHelp")}
        </p>
        <p className="notice">{tr("issues.privacy")}</p>
        <p className="small">
          <a href="mailto:security@aaw.se">{tr("issues.security")}</a>
        </p>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !fields.title.trim() ||
              !fields.description.trim() ||
              !fields.expected.trim() ||
              (fields.kind === "bug" && !fields.steps.trim())
            ) {
              setError(true);
              return;
            }
            const draft = issueDraft(fields, language);
            setPrepared(draft);
            setError(false);
            if (!draft.needsCopy)
              window.open(draft.url, "_blank", "noopener,noreferrer");
            requestAnimationFrame(() =>
              reportArea.current?.scrollIntoView({ block: "nearest" }),
            );
          }}
        >
          <div className="form-grid">
            <label>
              {tr("issues.type")}
              <select
                value={fields.kind}
                onChange={(event) => change("kind", event.target.value)}
              >
                <option value="bug">{tr("issues.bug")}</option>
                <option value="feature">{tr("issues.feature")}</option>
              </select>
            </label>
            <label>
              {tr("issues.title")}
              <input
                autoFocus
                required
                maxLength={120}
                value={fields.title}
                onChange={(event) => change("title", event.target.value)}
              />
            </label>
          </div>
          <label>
            {tr(fields.kind === "bug" ? "issues.actual" : "issues.problem")}
            <textarea
              required
              maxLength={8000}
              value={fields.description}
              onChange={(event) => change("description", event.target.value)}
            />
          </label>
          {fields.kind === "bug" && (
            <label>
              {tr("issues.steps")}
              <textarea
                required
                maxLength={8000}
                placeholder={tr("issues.stepsHint")}
                value={fields.steps}
                onChange={(event) => change("steps", event.target.value)}
              />
            </label>
          )}
          <label>
            {tr(fields.kind === "bug" ? "issues.expected" : "issues.proposal")}
            <textarea
              required
              maxLength={8000}
              value={fields.expected}
              onChange={(event) => change("expected", event.target.value)}
            />
          </label>
          <label>
            {tr("issues.environment")}
            <textarea
              maxLength={1000}
              value={fields.environment}
              onChange={(event) => change("environment", event.target.value)}
            />
            <span className="muted">{tr("issues.environmentHelp")}</span>
          </label>
          <label>
            {tr("issues.additional")}
            <textarea
              maxLength={8000}
              value={fields.additional}
              onChange={(event) => change("additional", event.target.value)}
            />
            <span className="muted">{tr("issues.attachHelp")}</span>
          </label>
          {error && <p role="alert">{tr("issues.required")}</p>}
          <div className="actions">
            <button type="submit">
              {tr("issues.continue")}
              <ArrowUpRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => dialog.current?.close()}
            >
              {tr("common.cancel")}
            </button>
          </div>
        </form>
        {prepared && (
          <div ref={reportArea} className="issue-prepared" role="status">
            <p>
              {tr(
                prepared.needsCopy ? "issues.longReport" : "issues.draftReady",
              )}
            </p>
            {prepared.needsCopy && (
              <>
                <textarea
                  aria-label={tr("issues.fullReport")}
                  readOnly
                  value={prepared.report}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(prepared.report);
                      setCopied(true);
                      setCopyFailed(false);
                    } catch {
                      setCopied(false);
                      setCopyFailed(true);
                    }
                  }}
                >
                  <Copy size={16} aria-hidden="true" />
                  {tr(copied ? "issues.copied" : "issues.copy")}
                </button>
                {copyFailed && <p role="alert">{tr("issues.copyFailed")}</p>}
              </>
            )}
            <a
              className="button secondary"
              href={prepared.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tr("issues.openDraft")}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        )}
      </dialog>
    </>
  );
}
