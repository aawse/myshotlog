"use client";
import { useJournalState } from "./journal-provider";
import { QuickIssueReport } from "./quick-issue-report";
import { SyncStatus } from "./sync-status";
export function JournalTools() {
  const { status } = useJournalState();
  return (
    <div className="journal-tools-space">
      <div className="journal-tools">
        <SyncStatus />
        {status !== "authentication" && <QuickIssueReport />}
      </div>
    </div>
  );
}
