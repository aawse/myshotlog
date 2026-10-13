import { expect, it } from "vitest";
import { redactPerformanceEvent } from "../lib/performance";
const origin = "https://example.test";
it.each([
  ["/sessions/private-session/?token=secret#note", "/sessions/[id]/"],
  ["/sessions/private-session/edit/?name=personal", "/sessions/[id]/edit/"],
  ["/firearms/private-firearm/", "/firearms/[id]/"],
  ["/sessions/new/?location=personal", "/sessions/new/"],
  ["/settings?birthDate=personal", "/settings/"],
  ["/dashboard/", "/dashboard/"],
  ["/", "/"],
])("reports only the page category for %s", (path, route) => {
  expect(
    redactPerformanceEvent(
      { type: "vital", url: origin + path, route: path },
      origin,
    ),
  ).toEqual({ type: "vital", url: origin + route, route });
});
it.each([
  "invalid",
  "https://another.test/dashboard/",
  "https://user:password@example.test/dashboard/",
  origin + "/auth/github/callback/?code=secret",
  origin + "/api/photos/private-photo/",
  origin + "/unknown-personal-path/",
])("rejects unrecognized or sensitive URLs: %s", (url) => {
  expect(redactPerformanceEvent({ type: "vital", url }, origin)).toBeNull();
});
