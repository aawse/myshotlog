import type { Session, Assessment } from "./models";
export type SeriesMedals = {
  gold: number;
  silver: number;
  bronze: number;
  unassessed: number;
};
const highestFirst = ["gold", "silver", "bronze"] as const;
// Use saved conclusions only; never substitute today's rules or the user's current age.
// All displays share the latest conclusion per level for each current series/revision.
export function sessionSeriesRatings(
  session: Session,
  assessments: Assessment[],
) {
  const latest = new Map<string, Assessment>();
  for (const a of assessments) {
    if (a.sessionId !== session.id || a.revision !== session.revision) continue;
    const key = a.resultId + ":" + a.level;
    const previous = latest.get(key);
    if (!previous || a.createdAt >= previous.createdAt) latest.set(key, a);
  }
  return session.results.map((result) => {
    const conclusions = highestFirst.map((level) =>
      latest.get(result.id + ":" + level),
    );
    const earned = conclusions.find((a) => a?.status === "met");
    const incomplete = conclusions.some((a) => !a);
    const unknown = conclusions.find(
      (a) => a?.status === "not-evaluated" || a?.status === "not-applicable",
    );
    const status: Assessment["status"] = earned
      ? "met"
      : incomplete
        ? "not-evaluated"
        : (unknown?.status ?? "not-met");
    // For a failure, retain the lowest threshold's supporting calculation.
    const assessment =
      earned ?? unknown ?? (incomplete ? undefined : conclusions.at(-1));
    return {
      result,
      medal: earned?.level,
      status,
      assessment,
      assessments: conclusions.filter((a): a is Assessment => Boolean(a)),
      points:
        result.points === undefined
          ? undefined
          : result.points - (result.penaltyPoints ?? 0),
    };
  });
}
export function sessionMedalCounts(
  sessions: Session[],
  assessments: Assessment[],
): Record<string, SeriesMedals> {
  const bySession = new Map<string, Assessment[]>();
  for (const a of assessments) {
    const list = bySession.get(a.sessionId) ?? [];
    list.push(a);
    bySession.set(a.sessionId, list);
  }
  return Object.fromEntries(
    sessions.map((session) => {
      const counts: SeriesMedals = {
        gold: 0,
        silver: 0,
        bronze: 0,
        unassessed: 0,
      };
      for (const rating of sessionSeriesRatings(
        session,
        bySession.get(session.id) ?? [],
      )) {
        if (rating.medal) counts[rating.medal]++;
        else if (
          rating.status === "not-evaluated" ||
          rating.status === "not-applicable"
        )
          counts.unassessed++;
      }
      return [session.id, counts];
    }),
  );
}
