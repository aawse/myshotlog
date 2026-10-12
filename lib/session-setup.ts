import { swText, t, type Language } from "@/lib/i18n";
import { discipline, type DisciplineId } from "./disciplines";
import { sessionSchema, type Session, type Firearm } from "./models";
export function sessionSetup(initial: Session): Session {
  const session = { ...initial };
  for (const key of ["distance", "target", "seconds"] as const) {
    if (session[key] !== undefined) continue;
    const values = initial.results.map((r) => r[key]);
    if (
      values.length &&
      values.every((v) => v === values[0]) &&
      values[0] !== undefined
    ) {
      if (key === "distance") session.distance = initial.results[0].distance;
      else if (key === "target") session.target = initial.results[0].target;
      else session.seconds = initial.results[0].seconds;
    }
  }
  return sessionSchema.parse(session);
}
export function hasMixedLegacyConditions(session: Session) {
  return (["distance", "target", "seconds"] as const).some(
    (key) =>
      session[key] === undefined &&
      new Set(session.results.map((r) => r[key])).size > 1,
  );
}
export function changeDiscipline(
  session: Session,
  id: DisciplineId,
  language: Language = "sv",
): Session {
  if (id === session.discipline) return session;
  const kind = discipline(id).kind;
  return {
    ...session,
    discipline: id,
    program:
      session.program === swText("session.defaultProgram") ||
      session.program === t(language, "session.defaultProgram") ||
      session.program === discipline(session.discipline).name ||
      session.program === t(language, `discipline.${session.discipline}`)
        ? t(language, `discipline.${id}`)
        : session.program,
    results: session.results.map((r) => ({
      ...r,
      type: id === "application" ? "application" : "score",
      shots: id === "application" && r.shots === 5 ? 6 : r.shots,
      points: ["points", "dynamic"].includes(kind) ? (r.points ?? 0) : r.points,
      hits: kind !== "points" ? (r.hits ?? 0) : r.hits,
    })),
  };
}
export function selectFirearm(
  session: Session,
  firearm: Firearm | undefined,
  editing = false,
  language: Language = "sv",
): Session {
  const selected = {
    ...session,
    firearmId: firearm?.id ?? null,
    group: firearm?.group ?? session.group,
  };
  return !editing && firearm?.defaultDiscipline
    ? changeDiscipline(selected, firearm.defaultDiscipline, language)
    : selected;
}
