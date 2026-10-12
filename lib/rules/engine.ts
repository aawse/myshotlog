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
  return levels.map((level, i) => {
    const base = {
      sessionId: session.id,
      resultId: result.id,
      revision: session.revision,
      level,
      ruleVersion: rule?.id ?? "unsupported",
      source: rule ? rule.source + " — " + rule.reference : "",
      input: {
        date: session.date,
        group: session.group,
        discipline: session.discipline,
        birthDate: profile.birthDate ?? null,
        birthYear,
        ageBasis: rule?.ageBasis ?? null,
        ageReferenceYear: year - 1,
        ruleSnapshot: rule ? structuredClone(rule) : null,
        evaluatorVersion: 3,
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
      return out("not-evaluated", "Indata är ogiltiga eller ofullständiga.");
    if (
      (profile.birthDate && profile.birthDate > session.date) ||
      (birthYear !== null && birthYear > year)
    )
      return out(
        "not-evaluated",
        "Provets datum ligger före födelsedatumet eller födelseåret.",
      );
    if (!["precision", "application"].includes(session.discipline))
      return out(
        "not-evaluated",
        "Märkes- och medaljregler för denna gren är ännu inte implementerade.",
      );
    if (!rule)
      return out(
        "not-evaluated",
        "Ingen verifierad regelversion för resultatets datum.",
      );
    if (session.date < rule.from || session.date >= rule.until)
      return out(
        "not-evaluated",
        "Provdatumet omfattas inte av seriens sparade regelversion.",
      );
    if (!["A", "B", "C"].includes(session.group))
      return out(
        "not-evaluated",
        "Den här vapengruppen omfattas inte av den implementerade regelvägen.",
      );
    const group = session.group as "A" | "B" | "C";
    if (session.discipline === "precision") {
      if (
        result.type !== "score" ||
        result.shots !== 5 ||
        result.points === undefined ||
        !Number.isInteger(result.points) ||
        result.points > 50
      )
        return out(
          "not-evaluated",
          "Precisonsberäkningen kräver fem skott och heltalspoäng mellan 0 och 50.",
        );
      const threshold =
        rule.precision[group][i] -
        (birthYear === null ? 0 : ageReduction(birthYear, year));
      const points = result.points - (result.penaltyPoints ?? 0);
      return out(
        points >= threshold ? "met" : "not-met",
        `${points} av minst ${threshold} poäng.${birthYear === null ? " Utan åldersavdrag; födelseuppgifter saknas." : ""}`,
      );
    }
    if (
      result.type !== "application" ||
      Boolean(result.penaltySeconds) ||
      result.shots !== 6 ||
      result.hits === undefined ||
      result.seconds === undefined
    )
      return out(
        "not-evaluated",
        "Tillämpningsberäkningen kräver sex skott, antal träffar och skjuttid.",
      );
    const hits = rule.application[i],
      seconds = rule.applicationSeconds[group][i];
    return out(
      result.hits >= hits && result.seconds <= seconds ? "met" : "not-met",
      `${result.hits}/${hits} träffar, ${result.seconds}/${seconds} sekunder.`,
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
  const relevant = sessions.filter(
    (s) =>
      s.date.startsWith(String(year)) &&
      s.group === group &&
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
      !["A", "B", "C"].includes(group) || (!complete && unknown)
        ? "not-evaluated"
        : complete
          ? "met"
          : "not-met",
    reason:
      "Tre sparade precisionsdelprestationer + tre tillämpning inom kalenderåret. Varje serie använder sina registrerade regler och födelseuppgifter. Alternativa provvägar, tidigare märkesinnehav och föreningens beslut bedöms separat. Inget officiellt intyg.",
  } as const;
}
// Only arithmetic on already adjudicated inputs. No guessed penalty, ranking or competition-award rules.
export function summarize(session: Session) {
  return session.results.reduce(
    (a, r) => ({
      points: a.points + (r.points ?? 0) - (r.penaltyPoints ?? 0),
      hits: a.hits + (r.hits ?? 0),
      figures: a.figures + (r.figures ?? 0),
      seconds:
        a.seconds +
        (seriesConditions(session, r).seconds ?? 0) +
        (r.penaltySeconds ?? 0),
      shots: a.shots + r.shots,
      x: a.x + (r.x ?? 0),
    }),
    { points: 0, hits: 0, figures: 0, seconds: 0, shots: 0, x: 0 },
  );
}
