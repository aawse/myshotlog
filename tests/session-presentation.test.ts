import { expect, it } from "vitest";
import { appliedAgeGroups } from "../lib/rules/presentation";
import { sessionSeriesRatings } from "../lib/session-medals";
import { evaluate } from "../lib/rules/engine";
import { profile, session } from "./fixtures";
it("groups captured ages without consulting a changed profile", () => {
  const assessments = evaluate(session, session.results[0], profile).map(
    (a, i) => ({ ...a, id: String(i), createdAt: "2026-10-10T12:00:00Z" }),
  );
  const ratings = sessionSeriesRatings(session, assessments);
  expect(appliedAgeGroups(ratings)).toEqual([
    { age: 35, year: 2025, series: ["Serie"] },
  ]);
  const older = evaluate(session, session.results[0], {
    ...profile,
    birthYear: 1960,
  }).map((a, i) => ({
    ...a,
    id: String(i),
    createdAt: "2026-10-10T12:00:00Z",
  }));
  expect(appliedAgeGroups(sessionSeriesRatings(session, older))[0].age).toBe(
    65,
  );
});
it("keeps missing or invalid captured age unknown", () => {
  expect(
    appliedAgeGroups(sessionSeriesRatings(session, []))[0].age,
  ).toBeUndefined();
  const assessments = evaluate(session, session.results[0], profile).map(
    (a) => ({
      ...a,
      id: "fixture",
      createdAt: "2026-10-10T12:00:00Z",
      input: {
        birthYear: 2030,
        ageReferenceYear: 2025,
        ageBasis: "previous-calendar-year",
      },
    }),
  );
  expect(
    appliedAgeGroups(sessionSeriesRatings(session, assessments))[0].age,
  ).toBeUndefined();
});
