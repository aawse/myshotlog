import { expect, it } from "vitest";
import { sessionDisplayConditions } from "../lib/session-conditions";
import { session } from "./fixtures";
it("summarizes matching legacy series without changing stored data", () => {
  const original = structuredClone(session);
  expect(sessionDisplayConditions(session)).toEqual({
    distance: 25,
    seconds: 300,
    target: "precision25",
  });
  expect(session).toEqual(original);
});
it("retains explicit session conditions and never hides differing stage conditions", () => {
  const mixed = {
    ...session,
    results: [
      session.results[0],
      { ...session.results[0], id: "other", stageTimeLimit: 20 },
    ],
  };
  expect(sessionDisplayConditions(mixed).seconds).toBeUndefined();
  expect(sessionDisplayConditions({ ...mixed, seconds: 300 }).seconds).toBe(
    300,
  );
  expect(
    sessionDisplayConditions({ ...mixed, seconds: null }).seconds,
  ).toBeNull();
});
