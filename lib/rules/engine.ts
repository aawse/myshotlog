import { netPoints } from "../result-metrics";
import { swText, t } from "../i18n";
import {
  resultSchema,
  seriesConditions,
  dateSchema,
  profileSchema,
  profileBirthYear,
  type Session,
  type Result,
  type Assessment,
  type Profile,
} from "../models";
import { rules, levels, type RuleVersion } from "./catalog";
function badgeGroup(group: string) {
  if (group === "A optisk") return "A";
  if (group === "A" || group === "B" || group === "C") return group;
  return undefined;
}
export function ageReduction(birthYear: number, year: number) {
  const age = year - 1 - birthYear;
  return age >= 65 ? 2 : age >= 55 ? 1 : 0;
}
export function evaluate(
  session: Session,
  result: Result,
  profile: Profile,
  catalog: readonly RuleVersion[] = rules,
): Omit<Assessment, "id" | "createdAt">[] {
  result = seriesConditions(session, result);
  delete result.conditionsConfirmed;
  delete result.evidence;
  const rule = catalog.find(
    (v) => session.date >= v.from && session.date < v.until,
  );
  const birthYear = profileBirthYear(profile),
    year = Number(session.date.slice(0, 4));
  const group = badgeGroup(session.group);
  return levels.map((level, i) => {
    const base = {
      sessionId: session.id,
      resultId: result.id,
      revision: session.revision,
      level,
      ruleVersion:
        session.discipline.startsWith("ipsc-") ||
        ["nordic-steel", "dmr", "custom"].includes(session.discipline)
          ? session.ruleReference || "manual"
          : (rule?.id ?? "unsupported"),
      source:
        session.discipline.startsWith("ipsc-") ||
        ["nordic-steel", "dmr", "custom"].includes(session.discipline)
          ? ""
          : rule
            ? rule.source + " — " + rule.reference
            : "",
      input: {
        date: session.date,
        group: session.group,
        discipline: session.discipline,
        birthDate: profile.birthDate ?? null,
        birthYear,
        ageBasis: rule?.ageBasis ?? null,
        ageReferenceYear: year - 1,
        ruleSnapshot: rule ? structuredClone(rule) : null,
        evaluatorVersion: 4,
        result,
      },
    };
    const out = (status: Assessment["status"], reason: string) => ({
      ...base,
      status,
      reason,
    });
    if (
      !resultSchema.safeParse(result).success ||
      !dateSchema.safeParse(session.date).success ||
      !profileSchema.safeParse(profile).success
    )
      return out("not-evaluated", swText("rules.invalidInput"));
    if (
      (profile.birthDate && profile.birthDate > session.date) ||
      (birthYear !== null && birthYear > year)
    )
      return out("not-evaluated", swText("rules.beforeBirth"));
    if (!["precision", "application"].includes(session.discipline))
      return out("not-evaluated", swText("rules.unsupportedSport"));
    if (!rule) return out("not-evaluated", swText("rules.noVersion"));
    if (session.date < rule.from || session.date >= rule.until)
      return out("not-evaluated", swText("rules.outsideVersion"));
    if (!group) return out("not-evaluated", swText("rules.unsupportedGroup"));
    if (session.discipline === "precision") {
      if (
        result.type !== "score" ||
        result.shots !== 5 ||
        result.points === undefined ||
        !Number.isInteger(result.points) ||
        result.points > 50
      )
        return out("not-evaluated", swText("rules.precisionInput"));
      const threshold =
        rule.precision[group][i] -
        (birthYear === null ? 0 : ageReduction(birthYear, year));
      const points = result.points - (result.penaltyPoints ?? 0);
      return out(
        points >= threshold ? "met" : "not-met",
        t(
          "sv",
          birthYear === null
            ? "rules.precisionScoreNoBirth"
            : "rules.precisionScore",
          { points, threshold },
        ),
      );
    }
    const shootingTime = result.seconds ?? (result.elapsedSeconds || undefined);
    if (
      result.type !== "application" ||
      Boolean(result.penaltySeconds) ||
      result.shots !== 6 ||
      result.hits === undefined ||
      shootingTime === undefined
    )
      return out("not-evaluated", swText("rules.applicationInput"));
    const hits = rule.application[i],
      seconds = rule.applicationSeconds[group][i];
    return out(
      result.hits >= hits && shootingTime <= seconds ? "met" : "not-met",
      t("sv", "rules.applicationScore", {
        hits: result.hits,
        requiredHits: hits,
        seconds: shootingTime,
        allowedSeconds: seconds,
      }),
    );
  });
}
export function progress(
  sessions: Session[],
  assessments: Assessment[],
  year: number,
  group: string,
  level: (typeof levels)[number],
) {
  const qualificationGroup = badgeGroup(group);
  const relevant = sessions.filter(
    (s) =>
      qualificationGroup &&
      s.date.startsWith(String(year)) &&
      badgeGroup(s.group) === qualificationGroup &&
      ["precision", "application"].includes(s.discipline),
  );
  const saved = relevant.flatMap((s) =>
    s.results.map((r) => ({
      discipline: s.discipline,
      assessment: assessments
        .filter(
          (a) =>
            a.sessionId === s.id &&
            a.resultId === r.id &&
            a.revision === s.revision &&
            a.level === level,
        )
        .at(-1),
    })),
  );
  const count = (discipline: string) =>
    saved.filter(
      (v) => v.discipline === discipline && v.assessment?.status === "met",
    ).length;
  const precision = count("precision"),
    application = count("application"),
    complete = precision >= 3 && application >= 3;
  const unknown = saved.some(
    (v) =>
      !v.assessment ||
      ["not-evaluated", "not-applicable"].includes(v.assessment.status),
  );
  return {
    precision,
    application,
    required: 3,
    status:
      !qualificationGroup || (!complete && unknown)
        ? "not-evaluated"
        : complete
          ? "met"
          : "not-met",
    reason: swText("rules.progressHelp"),
  } as const;
}
// Only arithmetic on already adjudicated inputs. No guessed penalty, ranking or competition-award rules.
export function summarize(session: Session) {
  return session.results.reduce(
    (a, r) => ({
      points: a.points + (netPoints(r, session.discipline) ?? 0),
      hits: a.hits + (r.hits ?? 0),
      figures: a.figures + (r.figures ?? 0),
      seconds:
        a.seconds +
        (r.elapsedSeconds ?? seriesConditions(session, r).seconds ?? 0) +
        (r.penaltySeconds ?? 0),
      shots: a.shots + r.shots,
      x: a.x + (r.x ?? 0),
    }),
    { points: 0, hits: 0, figures: 0, seconds: 0, shots: 0, x: 0 },
  );
}
