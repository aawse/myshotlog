"use client";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { redactPerformanceEvent } from "@/lib/performance";
export function PerformanceInsights() {
  return (
    <SpeedInsights
      debug={false}
      beforeSend={(event) => redactPerformanceEvent(event, location.origin)}
    />
  );
}
