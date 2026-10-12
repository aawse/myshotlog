"use client";
import { useI18n } from "@/components/language-provider";
export default function Loading() {
  const { tr } = useI18n();
  return (
    <div className="card" role="status">
      {tr("loading.journal")}
    </div>
  );
}
