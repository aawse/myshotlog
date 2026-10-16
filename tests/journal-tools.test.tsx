import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SyncSnapshot, SyncStatus } from "../lib/sync/controller";
import { initialState } from "../lib/sync/storage";
import { JournalTools } from "../components/journal-tools";
import { LanguageProvider } from "../components/language-provider";
import { t } from "../lib/i18n";
const fixture = vi.hoisted(() => ({
  snapshot: undefined as SyncSnapshot | undefined,
}));
vi.mock("../components/journal-provider", () => ({
  useJournal: () => ({ sync: vi.fn(), resolve: vi.fn(), restore: vi.fn() }),
  useJournalState: () => {
    if (!fixture.snapshot) throw new Error("Missing test snapshot");
    return fixture.snapshot;
  },
}));
beforeEach(() => {
  fixture.snapshot = {
    state: initialState("a".repeat(64)),
    records: null,
    status: "synced",
  };
});
function render(language: "sv" | "en" = "sv") {
  return renderToStaticMarkup(
    <LanguageProvider language={language}>
      <JournalTools />
    </LanguageProvider>,
  );
}
it.each(["sv", "en"] as const)(
  "renders accessible compact sync and feedback triggers in %s",
  (language) => {
    const html = render(language);
    expect(html).toContain(t(language, "sync.compactSynced"));
    expect(html).toContain(t(language, "sync.synced"));
    expect(html).toContain(t(language, "issues.report"));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-labelledby="sync-heading"');
    expect(html).not.toContain("<dialog open");
    expect(html).not.toContain('class="sync-status"');
  },
);
it.each([
  "loading",
  "pending",
  "syncing",
  "offline",
  "conflict",
  "authentication",
  "error",
  "storage",
] satisfies SyncStatus[])(
  "keeps %s status available without exposing feedback after authentication failure",
  (status) => {
    if (!fixture.snapshot) throw new Error("Missing test snapshot");
    fixture.snapshot.status = status;
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain("sync-trigger");
    if (status === "authentication")
      expect(html).not.toContain("issue-quick-button");
    else expect(html).toContain("issue-quick-button");
    if (["conflict", "authentication", "error", "storage"].includes(status))
      expect(html).toContain("sync-attention");
  },
);
it("retains pending backup and conflict recovery in the sync dialog", () => {
  if (!fixture.snapshot) throw new Error("Missing test snapshot");
  fixture.snapshot.status = "conflict";
  fixture.snapshot.state.pending = [
    {
      id: "30000000-0000-4000-8000-000000000001",
      action: "profile",
      payload: { displayName: "Fixture draft" },
      photos: [],
      recording: {
        recordedAt: "2026-10-16T12:00:00Z",
        birthDate: null,
        birthYear: null,
      },
      base: [{ kind: "profile", id: null, value: null }],
    },
  ];
  fixture.snapshot.state.conflict = {
    id: fixture.snapshot.state.pending[0].id,
    current: [
      { kind: "profile", id: null, value: { displayName: "Fixture server" } },
    ],
  };
  const html = render();
  for (const key of [
    "sync.backup",
    "sync.compare",
    "sync.keepDevice",
    "sync.restore",
  ] as const)
    expect(html).toContain(t("sv", key));
  expect(html).toContain("Fixture draft");
  expect(html).toContain("Fixture server");
  expect(html).toContain(t("sv", "sync.keepServer", { count: 1 }));
});
