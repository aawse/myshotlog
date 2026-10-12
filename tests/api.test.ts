import { vi, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
}));
vi.mock("../lib/data", () => ({ records: vi.fn(), journal: vi.fn() }));
import { records, journal } from "../lib/data";
import { POST, GET } from "../app/api/records/route";
import {
  DatabaseConflict,
  DatabaseUnavailable,
} from "../lib/git-database/types";
const request = () =>
  new NextRequest("http://localhost/api/records", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body: JSON.stringify({ action: "profile", payload: {} }),
  });
beforeEach(() => vi.resetAllMocks());
it("rejects unauthenticated reads and writes", async () => {
  vi.mocked(journal).mockRejectedValue(new Error("AUTH_REQUIRED"));
  vi.mocked(records).mockRejectedValue(new Error("AUTH_REQUIRED"));
  expect((await POST(request())).status).toBe(401);
  expect((await GET(request())).status).toBe(401);
});
it("rejects cross-origin writes before storage access", async () => {
  expect(
    (
      await POST(
        new NextRequest("http://localhost/api/records", {
          method: "POST",
          headers: { origin: "https://other.example" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(403);
  expect(journal).not.toHaveBeenCalled();
});
it.each([
  [new DatabaseConflict(), 409],
  [new DatabaseUnavailable(), 503],
])(
  "maps storage errors without treating them as logout",
  async (error, status) => {
    vi.mocked(journal).mockRejectedValue(error);
    expect((await POST(request())).status).toBe(status);
  },
);
it("returns the receipt from the authenticated store", async () => {
  const mutate = vi.fn().mockResolvedValue({ ok: true, commits: ["abc"] });
  vi.mocked(journal).mockResolvedValue({ mutate } as never);
  const response = await POST(request());
  expect(await response.json()).toEqual({ ok: true, commits: ["abc"] });
  expect(mutate).toHaveBeenCalledWith("profile", {});
});
