import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import { SessionForm } from "../components/session-form";
import { FirearmForm } from "../components/firearm-form";
import { sessionSchema, firearmSchema, seriesConditions } from "../lib/models";
import {
  sessionSetup,
  hasMixedLegacyConditions,
  selectFirearm,
  changeDiscipline,
} from "../lib/session-setup";
import { evaluate } from "../lib/rules/engine";
import { recordSeries } from "../lib/rules/recorded";
import { parseImport, exportRecords, csv } from "../lib/portability";
import { session, result, firearm, profile } from "./fixtures";
it("stores shared session settings without duplicating them in each series and evaluates every series with those settings", () => {
  const s = sessionSchema.parse({
    ...session,
    distance: 25,
    target: "precision25",
    results: [
      { ...result, distance: 50, target: "B100" },
      { ...result, id: crypto.randomUUID(), distance: 10, target: "other" },
    ],
  });
  expect(s.distance).toBe(25);
  expect(
    s.results.every((r) => r.distance === undefined && r.target === undefined),
  ).toBe(true);
  expect(
    s.results.every((r) => evaluate(s, r, profile)[2].status === "met"),
  ).toBe(true);
  expect(seriesConditions(s, s.results[0])).toMatchObject({
    distance: 25,
    target: "precision25",
  });
  const restored = parseImport(
    exportRecords({
      profile,
      firearms: [{ ...firearm, defaultDiscipline: "precision" }],
      sessions: [s],
      assessments: [],
    }),
  );
  expect(restored.sessions[0]).toEqual(s);
  expect(restored.firearms[0].defaultDiscipline).toBe("precision");
});
it("explicit clearing never falls back to a legacy series target or distance", () => {
  const s = sessionSchema.parse({ ...session, distance: null, target: null });
  expect(seriesConditions(s, result).distance).toBeUndefined();
  expect(seriesConditions(s, result).target).toBeUndefined();
  expect(evaluate(s, result, profile)[2].status).toBe("met");
});
it("lifts matching legacy conditions and preserves mixed older data until the user changes a shared setting", () => {
  const lifted = sessionSetup(session);
  expect(lifted).toMatchObject({ distance: 25, target: "precision25" });
  expect(hasMixedLegacyConditions(lifted)).toBe(false);
  const mixed = sessionSchema.parse({
    ...session,
    results: [
      result,
      { ...result, id: crypto.randomUUID(), distance: 50, target: "B100" },
    ],
  });
  const form = sessionSetup(mixed);
  expect(form.distance).toBeUndefined();
  expect(form.target).toBeUndefined();
  expect(hasMixedLegacyConditions(form)).toBe(true);
  const normalized = sessionSchema.parse(form);
  expect(
    normalized.results.map((r) => seriesConditions(normalized, r)),
  ).toEqual(mixed.results);
  expect(seriesConditions(form, form.results[1]).distance).toBe(50);
});
it("selects firearm defaults for new sessions, preserves result IDs and supports manual override and editing", () => {
  const f = firearmSchema.parse({
    ...firearm,
    defaultDiscipline: "application",
  });
  const selected = selectFirearm(session, f);
  expect(selected.discipline).toBe("application");
  expect(selected.firearmId).toBe(firearm.id);
  expect(selected.results[0].id).toBe(result.id);
  expect(selected.results[0].points).toBe(result.points);
  expect(selected.results[0].shots).toBe(6);
  expect(selected.results[0].hits).toBe(0);
  expect(changeDiscipline(selected, "field").discipline).toBe("field");
  expect(selectFirearm(session, f, true).discipline).toBe(session.discipline);
  expect(selectFirearm(session, firearm).discipline).toBe(session.discipline);
  expect(selectFirearm(session, undefined).firearmId).toBeNull();
  expect(() =>
    firearmSchema.parse({ ...firearm, defaultDiscipline: "unknown" }),
  ).toThrow();
});
it("moving conditions to the session keeps existing assessment snapshots unchanged", () => {
  const old = recordSeries(session, result, profile, []).map((a) => ({
    ...a,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }));
  const s = sessionSchema.parse({ ...sessionSetup(session), revision: 2 });
  const after = recordSeries(s, s.results[0], profile, old);
  expect(after[2].input).toEqual(old[2].input);
  expect(after[2].ruleVersion).toBe(old[2].ruleVersion);
  expect(after[2].status).toBe(old[2].status);
});
it("renders distance and target once in the session section and a firearm default sport selector", () => {
  const s = {
    ...session,
    results: [result, { ...result, id: crypto.randomUUID() }],
  };
  const html = renderToStaticMarkup(
    <SessionForm firearms={[firearm]} initial={s} />,
  );
  expect(html.match(/Avstånd \(meter\)/g)).toHaveLength(1);
  expect(html.match(/Måltyp/g)).toHaveLength(1);
  expect(html.indexOf("Måltyp")).toBeLessThan(
    html.indexOf("Resultat per serie"),
  );
  expect(renderToStaticMarkup(<FirearmForm initial={firearm} />)).toContain(
    "Förvald gren",
  );
});
it("uses dropdowns for caliber and target and preserves previously saved values", () => {
  const gun = renderToStaticMarkup(
    <FirearmForm initial={{ ...firearm, caliber: "Legacy caliber" }} />,
  );
  expect(gun).toMatch(/<select[^>]*name="caliber"/);
  expect(gun).toContain(".22 LR");
  expect(gun).toContain("9 × 19 mm");
  expect(gun).toContain("Legacy caliber");
  expect(gun).not.toMatch(/<input[^>]*value="Legacy caliber"/);
  const form = renderToStaticMarkup(
    <SessionForm
      firearms={[firearm]}
      initial={{ ...session, target: "Legacy target" }}
    />,
  );
  expect(form).toMatch(/<select[^>]*name="target"/);
  expect(form).toContain("Legacy target");
  expect(form).toContain("Pistoltavla precision 25 m");
  expect(form).not.toContain("session-targets");
  expect(form).not.toContain("skjutledare");
  expect(form).not.toContain("Jag bekräftar");
});
it("stores shared shooting time once, grades all application series with it and includes it in CSV", () => {
  const results = [result, { ...result, id: crypto.randomUUID() }].map((r) => ({
    ...r,
    type: "application" as const,
    shots: 6,
    hits: 6,
    seconds: 60,
  }));
  const s = sessionSchema.parse({
    ...session,
    discipline: "application",
    seconds: 15,
    results,
  });
  expect(s.results.every((r) => r.seconds === undefined)).toBe(true);
  expect(
    s.results.every((r) => evaluate(s, r, profile)[2].status === "met"),
  ).toBe(true);
  expect(seriesConditions(s, s.results[0]).seconds).toBe(15);
  expect(
    csv([s])
      .split("\r\n")
      .slice(1)
      .every((row) => row.includes('"15"')),
  ).toBe(true);
  const lifted = sessionSetup({
    ...session,
    results: [result, { ...result, id: crypto.randomUUID() }],
  });
  expect(lifted.seconds).toBe(300);
  const mixed = sessionSetup({
    ...session,
    results: [result, { ...result, id: crypto.randomUUID(), seconds: 15 }],
  });
  expect(mixed.seconds).toBeUndefined();
  expect(hasMixedLegacyConditions(mixed)).toBe(true);
  const html = renderToStaticMarkup(
    <SessionForm firearms={[firearm]} initial={s} />,
  );
  expect(html.match(/name="seconds"/g)).toHaveLength(1);
  expect(html.indexOf('name="seconds"')).toBeLessThan(
    html.indexOf("Resultat per serie"),
  );
});
it("requires shared time for timed sports and rejects invalid times", () => {
  const s = {
    ...session,
    discipline: "sra" as const,
    seconds: 12,
    results: [{ ...result, seconds: undefined }],
  };
  expect(() => sessionSchema.parse(s)).not.toThrow();
  expect(() => sessionSchema.parse({ ...s, seconds: null })).toThrow();
  expect(() => sessionSchema.parse({ ...s, seconds: -1 })).toThrow();
});
it("loads uniform legacy shooting time into the session and removes it from all series", () => {
  const old = {
    ...session,
    results: [result, { ...result, id: crypto.randomUUID() }],
  };
  const loaded = sessionSetup(old);
  expect(loaded.seconds).toBe(300);
  expect(loaded.results.every((r) => r.seconds === undefined)).toBe(true);
  const html = renderToStaticMarkup(
    <SessionForm firearms={[firearm]} initial={old} />,
  );
  const series = html.slice(html.indexOf("Resultat per serie"));
  expect(series).not.toContain("Skjuttid");
  expect(series).not.toContain("300");
  expect(html.match(/name="seconds"/g)).toHaveLength(1);
});
