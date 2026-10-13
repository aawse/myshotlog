"use client";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { PerformanceInsights } from "./performance-insights";
import { filterAnalyticsEvent } from "@/lib/telemetry";
export function AppTelemetry({ speedEnabled }: { speedEnabled: boolean }) {
  const pathname = usePathname();
  if (pathname === "/witness" || pathname?.startsWith("/witness/")) return null;
  return (
    <>
      <Analytics debug={false} beforeSend={filterAnalyticsEvent} />
      {speedEnabled && <PerformanceInsights />}
    </>
  );
}
