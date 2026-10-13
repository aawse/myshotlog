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
vi.mock("../lib/data", () => ({ records: vi.fn() }));
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
import { records } from "../lib/data";
import Dashboard from "../app/(private)/dashboard/page";
import Layout from "../app/(private)/layout";
it("renders private dashboard without leaking serial or birth information", async () => {
  vi.mocked(records).mockResolvedValue({
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
  const content = renderToStaticMarkup(
    await Layout({ children: await Dashboard() }),
  );
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
  vi.mocked(records).mockResolvedValue({
    profile: { ...profile, language: "en", displayName: "Översikt" },
    firearms: [],
    sessions: [],
    assessments: [],
  });
  const html = renderToStaticMarkup(
    await Layout({ children: await Dashboard() }),
  );
  expect(html).toContain("Hello, Översikt.");
  expect(html).toContain("My firearms");
  expect(html).toContain("Recent sessions");
});

it("localizes built-in calibers on firearm and historical session pages without changing stored values", async () => {
  const { LanguageProvider } = await import("../components/language-provider");
  const { default: Firearms } = await import("../app/(private)/firearms/page");
  const { default: Details } =
    await import("../app/(private)/sessions/[id]/page");
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
  vi.mocked(records).mockResolvedValue(data);
  expect(renderToStaticMarkup(await Firearms())).toContain(
    "4.5 mm (.177, air pistol)",
  );
  const html = renderToStaticMarkup(
    <LanguageProvider language="en">
      {await Details({ params: Promise.resolve({ id: session.id }) })}
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
  vi.mocked(records).mockResolvedValue(empty);
  const html = renderToStaticMarkup(await Dashboard());
  expect(html).toContain("Välkommen till din journal");
  expect(html).toContain('type="file"');
  expect(html).toContain('accept="application/json,.json"');
  vi.mocked(records).mockResolvedValue({ ...empty, firearms: [firearm] });
  const populated = renderToStaticMarkup(await Dashboard());
  expect(populated).not.toContain('type="file"');
});
