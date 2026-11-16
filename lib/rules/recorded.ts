import { sessionSeriesRatings } from "../session-medals";
import { evaluate } from "./engine";
import { rules, type RuleVersion } from "./catalog";
import {
  profileSchema,
  type Assessment,
  type Profile,
  type Session,
  type Result,
} from "../models";
// Use the dated catalogue directly, never a stored verification status or rule snapshot.
export function recordSeries(
  session: Session,
  result: Result,
  profile: Profile,
  history: Assessment[],
  catalog: readonly RuleVersion[] = rules,
) {
  const previous = history.find(
    (a) => a.sessionId === session.id && a.resultId === result.id,
  );
  const input = previous?.input as
    { birthDate?: unknown; birthYear?: unknown } | undefined;
  const captured =
    input && Object.hasOwn(input, "birthYear")
      ? profileSchema.safeParse({
          ...profile,
          birthDate: input.birthDate ?? null,
          birthYear: input.birthYear,
        })
      : null;
  const birthProfile = captured?.success ? captured.data : profile;
  return evaluate(session, result, birthProfile, catalog);
}

export function evaluatePendingSeries(
  session: Session,
  profile: Profile,
  history: Assessment[],
) {
  return sessionSeriesRatings(session, history).flatMap(
    ({ result, status, assessments }) => {
      if (status !== "not-evaluated") return [];
      return recordSeries(session, result, profile, history).filter(
        (next) =>
          !assessments.some(
            (saved) =>
              saved.level === next.level &&
              saved.status === next.status &&
              saved.ruleVersion === next.ruleVersion &&
              saved.reason === next.reason,
          ),
      );
    },
  );
}
