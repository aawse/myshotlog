import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profile, firearm, session } from "./fixtures";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const browser = vi.hoisted(() => ({
  data: undefined as import("../lib/models").Records | undefined,
}));
vi.mock("../lib/data", () => ({ records: vi.fn() }));
vi.mock("../components/journal-provider", () => ({
  useJournal: () => null,
  useRecords: () => browser.data,
  useJournalState: () => ({
    records: browser.data,
    state: { head: null, pending: [] },
  }),
}));
vi.mock("../components/browser-witness-panel", () => ({
  BrowserWitnessPanel: () => null,
}));
vi.mock("../components/language-provider", async (original) => {
  const provider =
    await original<typeof import("../components/language-provider")>();
  const { translator } = await import("../lib/i18n");
  return {
    ...provider,
    useI18n: () => translator(browser.data?.profile.language),
  };
});
function recordsFixture(value: import("../lib/models").Records) {
  browser.data = value;
}
vi.mock("../lib/auth/server", () => ({
  configured: () => true,
  currentUser: async () => ({ id: "test" }),
  authenticated: async () => ({
    user: { id: "test", githubId: "1", login: "test" },
  }),
}));
vi.mock("../lib/witness/server", () => ({
  ownerWitnessStore: async () => ({ invitations: async () => [] }),
}));
vi.mock("../app/auth/actions", () => ({ signOut: async () => {} }));
import Dashboard from "../components/journal-views/dashboard";

it("renders private dashboard without leaking serial or birth information", async () => {
  recordsFixture({
    profile: { ...profile, displayName: "Testskytt" },
    firearms: [firearm],
    sessions: [
      session,
      {
        ...session,
        id: crypto.randomUUID(),
        date: "2026-10-08",
        results: [{ ...session.results[0], points: 43 }],
      },
      {
        ...session,
        id: crypto.randomUUID(),
        date: "2026-10-04",
        results: [{ ...session.results[0], points: 41 }],
      },
    ],
    assessments: [],
  });
  const content = renderToStaticMarkup(<Dashboard />);
  expect(content).toContain("Testskytt");
  expect(content).toContain("Precisionsskjutning");
  expect(content).not.toContain(firearm.serial);
  expect(content).not.toContain("1990");
  const previewDirectory = join(tmpdir(), "myshotlog-preview");
  await mkdir(previewDirectory, { recursive: true });
  await writeFile(
    join(previewDirectory, "index.html"),
    `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyShotLog · UI-test med fiktiva data</title><style>${await readFile("app/globals.css", "utf8")}</style><body>${content}</body></html>`,
  );
});
it("renders English server navigation and dashboard without translating the user's name", async () => {
  recordsFixture({
    profile: { ...profile, language: "en", displayName: "Översikt" },
    firearms: [],
    sessions: [],
    assessments: [],
  });
  const html = renderToStaticMarkup(<Dashboard />);
  expect(html).toContain("Hello, Översikt.");

  expect(html).toContain("Recent sessions");
});

it("localizes built-in calibers on firearm and historical session pages without changing stored values", async () => {
  const { LanguageProvider } = await import("../components/language-provider");
  const { default: Firearms } =
    await import("../components/journal-views/firearms");
  const { default: Details } =
    await import("../components/journal-views/session-details");
  const data = {
    profile: { ...profile, language: "en" as const },
    firearms: [{ ...firearm, caliber: "4.5 mm" }],
    sessions: [
      {
        ...session,
        target: "precision25",
        firearmSnapshot: { ...session.firearmSnapshot!, caliber: "4.5 mm" },
      },
    ],
    assessments: [],
  };
  recordsFixture(data);
  expect(renderToStaticMarkup(<Firearms />)).toContain(
    "4.5 mm (.177, air pistol)",
  );
  const html = renderToStaticMarkup(
    <LanguageProvider language="en">
      {<Details id={session.id} />}
    </LanguageProvider>,
  );
  expect(html).toContain("4.5 mm (.177, air pistol)");
  expect(html).toContain("25 m precision pistol target");
  expect(data.firearms[0].caliber).toBe("4.5 mm");
  expect(data.sessions[0].firearmSnapshot.caliber).toBe("4.5 mm");
});

it("offers direct JSON import on an empty dashboard and hides it when journal entries exist", async () => {
  const empty = {
    profile,
    firearms: [],
    sessions: [],
    assessments: [],
    quickEntries: [],
  };
  recordsFixture(empty);
  const html = renderToStaticMarkup(<Dashboard />);
  expect(html).toContain("Välkommen till din journal");
  expect(html).toContain('type="file"');
  expect(html).toContain('accept="application/json,.json"');
  recordsFixture({ ...empty, firearms: [firearm] });
  const populated = renderToStaticMarkup(<Dashboard />);
  expect(populated).not.toContain('type="file"');
});

it("shows the same highest grade and net points once per series in both sections", async () => {
  const { default: Details } =
    await import("../components/journal-views/session-details");
  const { LanguageProvider } = await import("../components/language-provider");
  const scored = {
    ...session,
    results: [{ ...session.results[0], points: 46, penaltyPoints: 1 }],
  };
  const assessments = (["bronze", "silver", "gold"] as const).map((level) => ({
    id: crypto.randomUUID(),
    sessionId: session.id,
    resultId: session.results[0].id,
    revision: 1,
    ruleVersion: "fixture-rule",
    level,
    status: level === "gold" ? ("not-met" as const) : ("met" as const),
    reason: "45 av minst 34 poäng.",
    source: "",
    createdAt: "2026-10-13T00:00:00Z",
    input: {},
  }));
  recordsFixture({
    profile,
    firearms: [],
    sessions: [scored],
    assessments,
  });
  const html = renderToStaticMarkup(
    <LanguageProvider language="sv">
      {<Details id={session.id} />}
    </LanguageProvider>,
  );
  expect(html).toContain("45 poäng");
  expect(html).not.toContain("Delprestation uppfylld");
  expect(html).not.toContain("Kraven ej uppfyllda");
  expect(html).not.toContain("45 av minst 34 poäng");
  expect(html).not.toContain('class="series-medal bronze"');
  expect(html).toContain('class="series-medal silver"');
  expect(html).not.toContain('class="assessment-cross"');
  expect(html.match(/class="series-medal silver"/g)).toHaveLength(2);
  expect(html.match(/class="assessment"/g)).toHaveLength(1);
  expect(html).toContain("<td>45</td>");
  expect(html).not.toContain('class="series-medal gold"');
  recordsFixture({
    profile,
    firearms: [],
    sessions: [scored],
    assessments: assessments.map((a) => ({ ...a, status: "not-met" })),
  });
  const failed = renderToStaticMarkup(<Details id={session.id} />);
  expect(failed.match(/class="assessment-cross"/g)).toHaveLength(1);
  expect(failed).not.toContain("Kraven ej uppfyllda");
});

it("shows only current series calculations and ignores superseded or historical grades", async () => {
  const { default: Details } =
    await import("../components/journal-views/session-details");
  const a = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    resultId: session.results[0].id,
    revision: 1,
    ruleVersion: "current-rule",
    level: "gold" as const,
    status: "not-met" as const,
    reason: "",
    source: "",
    createdAt: "2026-10-10T14:00:00Z",
    input: {},
  };
  recordsFixture({
    profile,
    firearms: [],
    sessions: [session],
    assessments: [
      a,
      {
        ...a,
        id: crypto.randomUUID(),
        status: "met",
        createdAt: "2026-10-10T13:00:00Z",
      },
      {
        ...a,
        id: crypto.randomUUID(),
        status: "met",
        revision: 2,
        ruleVersion: "old-rule",
      },
      { ...a, id: crypto.randomUUID(), status: "met", level: "silver" },
      { ...a, id: crypto.randomUUID(), status: "met", level: "bronze" },
      {
        ...a,
        id: crypto.randomUUID(),
        status: "met",
        resultId: crypto.randomUUID(),
        ruleVersion: "removed-series",
      },
    ],
  });
  const html = renderToStaticMarkup(<Details id={session.id} />);
  expect(html.match(/class="series-medal silver"/g)).toHaveLength(2);
  expect(html.match(/class="assessment"/g)).toHaveLength(1);
  expect(html).not.toContain('class="series-medal gold"');
  expect(html).not.toContain("old-rule");
  expect(html).not.toContain("removed-series");
});

it.each(["sv", "en"] as const)(
  "shows the readable applied edition once per session in %s",
  async (language) => {
    const { default: Details } =
      await import("../components/journal-views/session-details");
    const { rules } = await import("../lib/rules/catalog");
    const { t } = await import("../lib/i18n");
    const results = [
      session.results[0],
      {
        ...session.results[0],
        id: crypto.randomUUID(),
        label: "Second series",
      },
    ];
    const s = { ...session, results };
    const assessments = results.flatMap((result) =>
      (["bronze", "silver", "gold"] as const).map((level) => ({
        id: crypto.randomUUID(),
        sessionId: s.id,
        resultId: result.id,
        revision: s.revision,
        ruleVersion: rules[0].id,
        level,
        status: "met" as const,
        reason: "",
        source: "",
        input: {},
        createdAt: "2026-10-10T12:00:00Z",
      })),
    );
    recordsFixture({
      profile: { ...profile, language },
      firearms: [],
      sessions: [s],
      assessments,
    });
    const html = renderToStaticMarkup(<Details id={s.id} />);
    const summary = html.match(
      /<div class="session-rules">([\s\S]*?)<\/div>/,
    )?.[1];
    expect(summary).toContain(t(language, "rules.edition21"));
    expect(html.match(/class="session-rules"/g)).toHaveLength(1);
    expect(html.split(t(language, "rules.edition21"))).toHaveLength(2);
    expect(html.match(/class="series-medal gold"/g)).toHaveLength(4);
    const visible = html.replace(/<details>[\s\S]*?<\/details>/g, "");
    expect(visible).not.toContain(rules[0].id);
    expect(html).toContain(rules[0].id);
  },
);
