"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MessageSquarePlus } from "lucide-react";
import { LoadingIndicator } from "./loading-indicator";
import { useI18n } from "./language-provider";
function ReportLoading() {
  const { tr } = useI18n();
  return (
    <div className="issue-quick-loading">
      <LoadingIndicator label={tr("issues.loading")} />
    </div>
  );
}
const IssueReport = dynamic(
  () => import("./issue-report").then((module) => module.IssueReport),
  { ssr: false, loading: ReportLoading },
);
export function QuickIssueReport() {
  const { tr, language } = useI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false),
    [loaded, setLoaded] = useState(false);
  return (
    <div className="issue-quick-control">
      <button
        ref={trigger}
        type="button"
        className="journal-tool-button issue-quick-button"
        aria-label={tr("issues.report")}
        title={tr("issues.report")}
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true);
          setOpened(true);
        }}
      >
        <MessageSquarePlus size={20} aria-hidden="true" />
        <span>{tr("issues.report")}</span>
      </button>
      {loaded && (
        <IssueReport
          pageLanguage={language}
          open={opened}
          onClose={() => {
            setOpened(false);
            trigger.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
