import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssessmentBasis } from "../components/assessment-basis";
import { LanguageProvider } from "../components/language-provider";
import { evaluate } from "../lib/rules/engine";
import { t, type Language } from "../lib/i18n";
import type { Assessment } from "../lib/models";
import { profile, result, session } from "./fixtures";

function assessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    ...evaluate(session, result, profile)[2],
    id: "10000000-0000-4000-8000-000000000004",
    createdAt: "2026-10-10T12:00:00Z",
    ...overrides,
  };
}
function render(a = assessment(), language: Language = "sv") {
  return renderToStaticMarkup(
    <LanguageProvider language={language}>
      <AssessmentBasis assessment={a} />
    </LanguageProvider>,
  );
}

it.each(["sv", "en"] as const)(
  "shows labelled saved results and requirements without internal data (%s)",
  (language) => {
    const html = render(assessment(), language);
    expect(html).toContain(
      `<dt>${t(language, "session.points")}</dt><dd>46</dd>`,
    );
    expect(html).toContain(
      `<dt>${t(language, "session.shots")}</dt><dd>5</dd>`,
    );
    expect(html).toContain(
      `<dt>${t(language, "session.group")}</dt><dd>C</dd>`,
    );
    expect(html).toContain(
      t(language, "basis.comparison", { level: t(language, "level.gold") }),
    );
    expect(html).toContain(
      t(language, "rules.precisionScore", { points: 46, threshold: 46 }),
    );
    expect(html).toContain(t(language, "basis.age", { year: 2025 }));
    expect(html).toContain("<dd>35</dd>");
    expect(html).toContain("<dd>1990</dd>");
    expect(html).not.toMatch(
      /<pre|ruleSnapshot|evaluatorVersion|birthYear|spsf-2026|10000000-/,
    );
  },
);

it("uses the recorded age and comparison, including an age adjustment, unchanged", () => {
  const recorded = evaluate(session, result, {
    ...profile,
    birthYear: 1960,
  })[2];
  const a = assessment(recorded);
  const before = structuredClone(a);
  const html = render(a);
  expect(html).toContain("<dd>65</dd>");
  expect(html).toContain("46 av minst 44 poäng.");
  expect(a).toEqual(before);
});

it("explains standard thresholds when no birth information was recorded", () => {
  const a = assessment(
    evaluate(session, result, {
      ...profile,
      birthDate: null,
      birthYear: null,
    })[2],
  );
  const html = render(a);
  expect(html).toContain(t("sv", "basis.noBirth"));
  expect(html).not.toContain(t("sv", "basis.ageHelp"));
});

it("shows application hits and times without implying an age adjustment", () => {
  const r = {
    ...result,
    type: "application" as const,
    shots: 6,
    hits: 6,
    seconds: 15,
    points: undefined,
  };
  const html = render(
    assessment(
      evaluate(
        { ...session, discipline: "application", results: [r] },
        r,
        profile,
      )[2],
    ),
    "en",
  );
  expect(html).toContain("<dt>Hits</dt><dd>6</dd>");
  expect(html).toContain("6/6 hits, 15/15 seconds.");
  expect(html).not.toContain(t("en", "basis.ageHelp"));
  expect(html).not.toContain(t("en", "basis.birthYear"));
});

it("preserves custom names and zero deductions in unsupported sports", () => {
  const r = {
    ...result,
    label: "Min specialserie",
    scoreText: "Egen notering",
    penaltyPoints: 0,
    elapsedSeconds: 12.5,
    target: "Min tavla",
  };
  const html = render(
    assessment(
      evaluate(
        { ...session, discipline: "custom", group: "Min klass" },
        r,
        profile,
      )[0],
    ),
    "en",
  );
  expect(html).toContain("Min specialserie");
  expect(html).toContain("Egen notering");
  expect(html).toContain("Min tavla");
  expect(html).toContain("Min klass");
  expect(html).toContain("<dt>Point deduction</dt><dd>0</dd>");
  expect(html).toContain("<dd>12.5</dd>");
  expect(html).not.toContain("Comparison with the requirements");
});

it.each([
  null,
  [],
  "invalid",
  {},
  {
    date: "2026-02-30",
    group: {},
    discipline: "unknown",
    result: { points: "bad" },
    ruleSnapshot: { secret: "HIDDEN" },
  },
])(
  "handles missing or invalid saved input without leaking unknown fields (%j)",
  (input) => {
    const html = render(assessment({ input }));
    expect(html).toContain(t("sv", "basis.unavailable"));
    expect(html).not.toContain("HIDDEN");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("1990");
  },
);

it("retains valid saved conditions when the saved result is malformed", () => {
  const html = render(
    assessment({
      input: {
        date: "2026-10-10",
        discipline: "precision",
        group: "C",
        birthYear: 1960,
        ageReferenceYear: 2025,
        ageBasis: "previous-calendar-year",
        result: { points: "invalid" },
      },
    }),
  );
  expect(html).toContain(t("sv", "basis.unavailable"));
  expect(html).toContain("<dd>C</dd>");
  expect(html).toContain("<dd>65</dd>");
  expect(html).not.toContain("<dd>46</dd>");
});
