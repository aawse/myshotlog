import { it, expect } from "vitest";
import { profileSchema, todayInTimezone } from "../lib/models";
import { evaluate } from "../lib/rules/engine";
import { rules, levels } from "../lib/rules/catalog";
import { profile, session, result } from "./fixtures";
it("stores full birth dates, derives birth years and accepts legacy birth-year-only profiles", () => {
  const { birthYear, birthDate, ...rest } = profile;
  void birthYear;
  void birthDate;
  expect(
    profileSchema.parse({ ...rest, birthDate: "1960-02-29" }),
  ).toMatchObject({ birthDate: "1960-02-29", birthYear: 1960 });
  expect(profileSchema.parse({ ...rest, birthYear: 1970 })).toMatchObject({
    birthDate: null,
    birthYear: 1970,
  });
  for (const date of ["1961-02-29", "2020-02-30", "1899-12-31", "2999-01-01"])
    expect(() => profileSchema.parse({ ...rest, birthDate: date })).toThrow();
  expect(() =>
    profileSchema.parse({ ...profile, birthDate: "1960-02-29" }),
  ).toThrow();
});
it("validates future dates against the profile timezone without converting birthdays", () => {
  const now = new Date("2026-01-01T00:30:00Z");
  expect(todayInTimezone("America/Los_Angeles", now)).toBe("2025-12-31");
  expect(todayInTimezone("Europe/Stockholm", now)).toBe("2026-01-01");
  expect(
    profileSchema.parse({
      ...profile,
      birthYear: null,
      birthDate: "1970-12-31",
      timezone: "Pacific/Kiritimati",
    }).birthDate,
  ).toBe("1970-12-31");
});
for (const group of ["A", "B", "C"] as const)
  for (const [i, level] of levels.entries())
    for (const [birthDate, reduction] of [
      ["1971-01-01", 0],
      ["1970-12-31", 1],
      ["1961-01-01", 1],
      ["1960-12-31", 2],
    ] as const) {
      it(`${group} ${level} birth date ${birthDate} threshold`, () => {
        const p = profileSchema.parse({
          ...profile,
          birthYear: null,
          birthDate,
        });
        const threshold = rules[0].precision[group][i] - reduction;
        expect(
          evaluate({ ...session, group }, { ...result, points: threshold }, p)[
            i
          ].status,
        ).toBe("met");
        expect(
          evaluate(
            { ...session, group },
            { ...result, points: threshold - 1 },
            p,
          )[i].status,
        ).toBe("not-met");
      });
    }
it("does not change requirements on the birthday and rejects performances before birth", () => {
  const p = profileSchema.parse({
    ...profile,
    birthYear: null,
    birthDate: "1971-06-15",
  });
  for (const date of ["2026-06-14", "2026-06-15", "2026-06-16"])
    expect(
      evaluate({ ...session, date }, { ...result, points: 45 }, p)[2].status,
    ).toBe("not-met");
  expect(
    evaluate(
      { ...session, date: "2027-01-01" },
      { ...result, points: 45 },
      p,
    )[2].status,
  ).toBe("met");
  const born = profileSchema.parse({
    ...profile,
    birthYear: null,
    birthDate: "2026-01-02",
  });
  expect(
    evaluate({ ...session, date: "2026-01-01" }, result, born).every(
      (a) => a.status === "not-evaluated",
    ),
  ).toBe(true);
});
