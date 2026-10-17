import { seriesConditions, type Session } from "./models";

// Older journals stored common conditions on each series. Summarize them only
// when all series agree; explicit session values and stage overrides stay intact.
export function sessionDisplayConditions(session: Session) {
  const results = session.results.map((result) =>
    seriesConditions(session, result),
  );
  function shared<K extends "distance" | "seconds" | "target">(key: K) {
    if (session[key] !== undefined) return session[key];
    const value = results[0]?.[key];
    return results.every((result) => result[key] === value) ? value : undefined;
  }
  return {
    distance: shared("distance"),
    seconds: shared("seconds"),
    target: shared("target"),
  };
}
