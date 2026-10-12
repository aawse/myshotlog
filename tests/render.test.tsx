import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profile, firearm, session } from "./fixtures";
vi.mock("../lib/data", () => ({ records: vi.fn() }));
vi.mock("../lib/auth/server", () => ({
  configured: () => true,
  currentUser: async () => ({ id: "test" }),
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
