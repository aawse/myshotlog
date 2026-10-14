import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth/server", () => ({
  configured: vi.fn(),
  currentUser: vi.fn(),
}));
const hint = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (hint.value ? { value: hint.value } : undefined),
  }),
}));
vi.mock("../lib/sync/server", () => ({ browserScope: () => "scope" }));
import { configured, currentUser } from "../lib/auth/server";
import { getI18n } from "../lib/i18n-server";
beforeEach(() => {
  vi.resetAllMocks();
  hint.value = undefined;
  vi.mocked(configured).mockReturnValue(true);
  vi.mocked(currentUser).mockResolvedValue({
    id: "owner",
    githubId: "12345",
    login: "user",
  });
});
it("uses an account-bound profile-language hint without Git reads", async () => {
  hint.value = "scope.en";
  expect((await getI18n()).language).toBe("en");
  expect((await getI18n()).tr("nav.settings")).toBe("Settings");
});
it("defaults to Swedish for missing, malformed or another account's language hints", async () => {
  for (const value of [undefined, "en", "other.en", "scope.fr"]) {
    hint.value = value;
    expect((await getI18n()).language).toBe("sv");
  }
});
it("does not accept a profile-language hint for an anonymous visitor", async () => {
  hint.value = "scope.en";
  vi.mocked(currentUser).mockResolvedValue(null);
  expect((await getI18n()).language).toBe("sv");
});
