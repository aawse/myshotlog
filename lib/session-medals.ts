import type { Session, Assessment } from "./models";
export type SeriesMedals = {
  gold: number;
  silver: number;
  bronze: number;
  unassessed: number;
};
// Count each current series once, using only its latest saved conclusions for the current revision.
export function sessionMedalCounts(
  sessions: Session[],
  assessments: Assessment[],
): Record<string, SeriesMedals> {
  const current = new Map(sessions.map((s) => [s.id, s]));
  const latest = new Map<string, Assessment>();
  for (const a of assessments) {
    const session = current.get(a.sessionId);
    if (!session || a.revision !== session.revision) continue;
    const key = a.sessionId + ":" + a.resultId + ":" + a.level,
      previous = latest.get(key);
    if (!previous || a.createdAt >= previous.createdAt) latest.set(key, a);
  }
  return Object.fromEntries(
    sessions.map((s) => {
      const counts: SeriesMedals = {
        gold: 0,
        silver: 0,
        bronze: 0,
        unassessed: 0,
      };
      for (const result of s.results) {
        const conclusions = (["gold", "silver", "bronze"] as const).map(
          (level) => latest.get(s.id + ":" + result.id + ":" + level),
        );
        const met = conclusions.find((a) => a?.status === "met");
        if (met) counts[met.level]++;
        else if (
          conclusions.some(
            (a) =>
              !a ||
              a.status === "not-evaluated" ||
              a.status === "not-applicable",
          )
        )
          counts.unassessed++;
      }
      return [s.id, counts];
    }),
  );
}
