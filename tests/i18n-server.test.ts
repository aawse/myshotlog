import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth/server", () => ({
  configured: vi.fn(),
  currentUser: vi.fn(),
}));
vi.mock("../lib/data", () => ({ records: vi.fn() }));
import { configured, currentUser } from "../lib/auth/server";
import { records } from "../lib/data";
import { getI18n } from "../lib/i18n-server";
import { profile } from "./fixtures";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(configured).mockReturnValue(true);
  vi.mocked(currentUser).mockResolvedValue({
    id: "owner",
    githubId: "12345",
    login: "user",
  });
});
it("selects English from the authenticated profile rather than browser preferences", async () => {
  vi.mocked(records).mockResolvedValue({
    profile: { ...profile, language: "en" },
  } as never);
  expect((await getI18n()).language).toBe("en");
  expect((await getI18n()).tr("nav.settings")).toBe("Settings");
});
it("defaults to Swedish for anonymous users or unavailable profile data", async () => {
  vi.mocked(currentUser).mockResolvedValue(null);
  expect((await getI18n()).language).toBe("sv");
  expect(records).not.toHaveBeenCalled();
  vi.mocked(currentUser).mockResolvedValue({
    id: "owner",
    githubId: "12345",
    login: "user",
  });
  vi.mocked(records).mockRejectedValue(new Error("unavailable"));
  expect((await getI18n()).language).toBe("sv");
});
