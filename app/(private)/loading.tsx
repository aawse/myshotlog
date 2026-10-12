"use client";
import { useI18n } from "@/components/language-provider";
import { LoadingIndicator } from "@/components/loading-indicator";
export default function Loading() {
  const { tr } = useI18n();
  return (
    <div className="card">
      <LoadingIndicator label={tr("loading.journal")} />
    </div>
  );
}
