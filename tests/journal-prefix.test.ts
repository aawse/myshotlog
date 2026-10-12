import { it, expect, vi } from "vitest";
import { journalPrefix } from "../lib/git-database/journal-prefix";
import { journalOwner } from "../lib/auth/session";
import type { GitDatabase } from "../lib/git-database/types";
it("preserves the deterministic journal ID", () => {
  expect(journalOwner("12345")).toBe("94ff2ddd-c3fb-8e07-b276-b041fe942943");
});
it("uses explicit paths without probing, prefers new journals and falls back to legacy journals", async () => {
  const snapshot = vi.fn(async (prefix: string) => ({
    head: null,
    files: new Map(
      prefix.startsWith("skytte/") ? [[prefix + "/profile.json", "{}"]] : [],
    ),
  }));
  const provider = { snapshot } as unknown as GitDatabase;
  expect(await journalPrefix(provider, "owner", "custom/path", true)).toBe(
    "custom/path",
  );
  expect(snapshot).not.toHaveBeenCalled();
  expect(await journalPrefix(provider, "owner", "myshotlog/v1", false)).toBe(
    "skytte/v1",
  );
  expect(snapshot.mock.calls.map((c) => c[0])).toEqual([
    "myshotlog/v1/users/owner",
    "skytte/v1/users/owner",
  ]);
  snapshot.mockResolvedValue({
    head: null,
    files: new Map([["profile.json", "{}"]]),
  });
  expect(await journalPrefix(provider, "owner", "myshotlog/v1", false)).toBe(
    "myshotlog/v1",
  );
  snapshot.mockResolvedValue({ head: null, files: new Map() });
  expect(await journalPrefix(provider, "owner", "myshotlog/v1", false)).toBe(
    "myshotlog/v1",
  );
});
