import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { sessionMedalCounts } from "../lib/session-medals";
import { SessionList } from "../components/session-list";
import { session, result } from "./fixtures";
import type { Assessment } from "../lib/models";
const conclusion = (
  resultId: string,
  level: Assessment["level"],
  status: Assessment["status"] = "met",
  extra: Partial<Assessment> = {},
): Assessment => ({
  id: crypto.randomUUID(),
  sessionId: session.id,
  resultId,
  revision: 1,
  ruleVersion: "saved-old-rule",
  status,
  level,
  reason: "saved",
  source: "",
  createdAt: "2026-10-10T12:00:00Z",
  input: { birthDate: "private-birth-date" },
  ...extra,
});
it("counts each series once at its highest achieved level, deduplicating repeated assessments", () => {
  const results = [
      result,
      { ...result, id: crypto.randomUUID() },
      { ...result, id: crypto.randomUUID() },
    ],
    s = { ...session, results };
  const assessments = [
    conclusion(results[0].id, "bronze"),
    conclusion(results[0].id, "silver"),
    conclusion(results[0].id, "gold"),
    conclusion(results[0].id, "gold"),
    conclusion(results[1].id, "gold", "not-met"),
    conclusion(results[1].id, "silver"),
    conclusion(results[1].id, "bronze"),
    conclusion(results[2].id, "gold", "not-met"),
    conclusion(results[2].id, "silver", "not-met"),
    conclusion(results[2].id, "bronze"),
  ];
  expect(sessionMedalCounts([s], assessments)[s.id]).toEqual({
    gold: 1,
    silver: 1,
    bronze: 1,
    unassessed: 0,
  });
});
it("ignores old revisions, removed results, other sessions and superseded conclusions", () => {
  const old = conclusion(result.id, "gold");
  const latest = conclusion(result.id, "gold", "not-met", {
    createdAt: "2026-10-10T13:00:00Z",
  });
  const assessments = [
    latest,
    old,
    conclusion(result.id, "gold", "met", { revision: 2 }),
    conclusion(crypto.randomUUID(), "gold"),
    conclusion(result.id, "gold", "met", { sessionId: crypto.randomUUID() }),
    conclusion(result.id, "silver"),
    conclusion(result.id, "bronze"),
  ];
  expect(sessionMedalCounts([session], assessments)[session.id]).toEqual({
    gold: 0,
    silver: 1,
    bronze: 0,
    unassessed: 0,
  });
});
it("distinguishes unassessed series from ones below all thresholds without evaluating current rules", () => {
  expect(sessionMedalCounts([session], [])[session.id]).toEqual({
    gold: 0,
    silver: 0,
    bronze: 0,
    unassessed: 1,
  });
  expect(
    sessionMedalCounts(
      [session],
      (["gold", "silver", "bronze"] as const).map((level) =>
        conclusion(result.id, level, "not-met"),
      ),
    )[session.id].unassessed,
  ).toBe(0);
});
it("renders medal icons and counts instead of score sums while retaining series and shots", () => {
  const medals = sessionMedalCounts(
    [session],
    [
      conclusion(result.id, "gold"),
      conclusion(result.id, "silver"),
      conclusion(result.id, "bronze"),
    ],
  );
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(
      <SessionList sessions={[session]} medals={medals} compact={compact} />,
    );
    expect(html).toContain("Guld: 1 serier");
    expect(html).toContain("Silver: 0 serier");
    expect(html).toContain("Brons: 0 serier");
    expect(html.match(/lucide-medal/g)).toHaveLength(3);
    expect(html).toContain("serier");
    expect(html).toContain("skott");
    expect(html).not.toContain("46 p");
    expect(html).not.toContain("private-birth-date");
  }
});
