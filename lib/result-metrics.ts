import type { Result, Session } from "./models";
import { discipline } from "./disciplines";
// Personal arithmetic, not an official match ranking or stage-point allocation.
export function netPoints(result: Result, sport: Session["discipline"]) {
  if (result.points === undefined) return undefined;
  const value = result.points - (result.penaltyPoints ?? 0);
  return discipline(sport).kind === "dynamic" ? Math.max(0, value) : value;
}
export function hitFactor(result: Result, sport: Session["discipline"]) {
  const points = netPoints(result, sport);
  return sport.startsWith("ipsc-") &&
    points !== undefined &&
    result.elapsedSeconds &&
    (!result.status || result.status === "completed")
    ? points / result.elapsedSeconds
    : undefined;
}
