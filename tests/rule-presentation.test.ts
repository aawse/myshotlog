import { expect, it } from "vitest";
import { appliedRuleGroups } from "../lib/rules/presentation";
import { sessionSeriesRatings } from "../lib/session-medals";
import { rules } from "../lib/rules/catalog";
import { session, result } from "./fixtures";
import type { Assessment } from "../lib/models";
function conclusions(
  resultId = result.id,
  version = rules[0].id,
): Assessment[] {
  return (["bronze", "silver", "gold"] as const).map((level) => ({
    id: crypto.randomUUID(),
    sessionId: session.id,
    resultId,
    revision: session.revision,
    level,
    status: "met",
    ruleVersion: version,
    reason: "",
    source: "",
    input: {},
    createdAt: "2026-10-10T12:00:00Z",
  }));
}
it("groups all current series and grade levels under one published edition", () => {
  const next = { ...result, id: crypto.randomUUID(), label: "Second series" };
  const s = { ...session, results: [result, next] };
  const before = [...conclusions(), ...conclusions(next.id)];
  const original = structuredClone(before);
  const groups = appliedRuleGroups(s, sessionSeriesRatings(s, before));
  expect(groups).toEqual([
    {
      id: rules[0].id,
      edition: rules[0].edition,
      reference: rules[0].reference,
      declared: false,
      series: [result.label, next.label],
    },
  ]);
  expect(before).toEqual(original);
});
it("uses matching historical publication metadata even when its catalogue entry is unavailable", () => {
  const data = conclusions(result.id, "historical-rule").map((a) => ({
    ...a,
    input: {
      ruleSnapshot: {
        id: "historical-rule",
        edition: "Handbook edition 20 (2024)",
        reference: "Appendix 1",
      },
    },
  }));
  expect(
    appliedRuleGroups(session, sessionSeriesRatings(session, data), [])[0],
  ).toMatchObject({
    edition: "Handbook edition 20 (2024)",
    reference: "Appendix 1",
  });
});
it("does not replace unknown or malformed historical metadata with today's edition", () => {
  for (const input of [
    null,
    {},
    { ruleSnapshot: null },
    { ruleSnapshot: { id: "wrong-id", edition: "Unrelated edition" } },
    { ruleSnapshot: { id: "historical-rule", edition: 21 } },
  ]) {
    const data = conclusions(result.id, "historical-rule").map((a) => ({
      ...a,
      input,
    }));
    expect(
      appliedRuleGroups(session, sessionSeriesRatings(session, data))[0]
        .edition,
    ).toBeUndefined();
  }
});
it("keeps genuinely different editions associated with their series", () => {
  const next = { ...result, id: crypto.randomUUID(), label: "Second series" };
  const s = { ...session, results: [result, next] };
  const data = [
    ...conclusions(),
    ...conclusions(next.id, "older-edition").map((a) => ({
      ...a,
      input: {
        ruleSnapshot: { id: "older-edition", edition: "Archived edition" },
      },
    })),
  ];
  const groups = appliedRuleGroups(s, sessionSeriesRatings(s, data));
  expect(groups).toHaveLength(2);
  expect(groups[0].series).toEqual([result.label]);
  expect(groups[1]).toMatchObject({
    edition: "Archived edition",
    series: [next.label],
  });
});
it("ignores removed series, other sessions, previous revisions and superseded conclusions", () => {
  const data = [
    ...conclusions(),
    ...conclusions(crypto.randomUUID(), "removed"),
    ...conclusions(result.id, "old-revision").map((a) => ({
      ...a,
      revision: 0,
    })),
    ...conclusions(result.id, "other-session").map((a) => ({
      ...a,
      sessionId: crypto.randomUUID(),
    })),
    ...conclusions(result.id, "superseded").map((a) => ({
      ...a,
      createdAt: "2026-10-09T12:00:00Z",
    })),
  ];
  expect(
    appliedRuleGroups(session, sessionSeriesRatings(session, data)).map(
      (group) => group.id,
    ),
  ).toEqual([rules[0].id]);
});
it("preserves user-entered rule references without interpreting them as a publication", () => {
  const s = {
    ...session,
    discipline: "custom" as const,
    ruleReference: "Översikt",
  };
  expect(
    appliedRuleGroups(
      s,
      sessionSeriesRatings(s, conclusions(result.id, "Översikt")),
    )[0],
  ).toMatchObject({ edition: "Översikt", declared: true });
  expect(
    appliedRuleGroups(
      session,
      sessionSeriesRatings(session, conclusions(result.id, "manual")),
    )[0],
  ).toMatchObject({ edition: undefined, declared: true });
});
it("does not infer a rule edition for a session with no recorded conclusions", () => {
  expect(appliedRuleGroups(session, sessionSeriesRatings(session, []))).toEqual(
    [],
  );
});
