"use client";
import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Bug } from "lucide-react";
import { LoadingIndicator } from "./loading-indicator";
import { useI18n } from "./language-provider";
import { translator, languageOrDefault } from "@/lib/i18n";
function subscribePageLanguage(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  return () => observer.disconnect();
}
function usePageI18n() {
  const { language: fallback } = useI18n();
  const witnessPage = /^\/witness\/?$/.test(usePathname() ?? "");
  const language = useSyncExternalStore(
    subscribePageLanguage,
    () =>
      witnessPage ? languageOrDefault(document.documentElement.lang) : fallback,
    () => fallback,
  );
  return translator(language);
}
function ReportLoading() {
  const { tr } = usePageI18n();
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
  const { tr, language } = usePageI18n();
  const [opened, setOpened] = useState(false),
    [loaded, setLoaded] = useState(false);
  return (
    <div className="issue-quick-control">
      <button
        type="button"
        className="issue-quick-button"
        aria-label={tr("issues.report")}
        title={tr("issues.report")}
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true);
          setOpened(true);
        }}
      >
        <Bug size={20} aria-hidden="true" />
        <span>{tr("issues.report")}</span>
      </button>
      {loaded && (
        <IssueReport
          pageLanguage={language}
          open={opened}
          onClose={() => setOpened(false)}
        />
      )}
    </div>
  );
}
