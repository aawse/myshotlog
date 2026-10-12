import { vi, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: vi.fn(),
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: () => ({ siteUrl: "http://localhost" }),
}));
vi.mock("../lib/data", () => ({ records: vi.fn(), journal: vi.fn() }));
const limitApi = vi.hoisted(() => vi.fn());
vi.mock("../lib/auth/security", () => ({
  securityStore: () => ({ limitApi }),
}));
import { authenticated } from "../lib/auth/server";
import { RateLimited } from "../lib/auth/security-store";
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
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "owner", githubId: "12345", login: "user" },
  });
});
it("rejects unauthenticated reads and writes", async () => {
  vi.mocked(authenticated).mockRejectedValue(new Error("AUTH_REQUIRED"));
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

it("returns 429 with Retry-After before reading a body or accessing journal data", async () => {
  limitApi.mockRejectedValue(new RateLimited(60));
  const req = request(),
    body = vi.spyOn(req, "text");
  const response = await POST(req);
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(body).not.toHaveBeenCalled();
  expect(journal).not.toHaveBeenCalled();
  expect((await GET(request())).status).toBe(429);
  expect(records).not.toHaveBeenCalled();
});
it("returns 413 before constructing a journal for oversized declared bodies", async () => {
  const response = await POST(
    new NextRequest("http://localhost/api/records", {
      method: "POST",
      headers: { origin: "http://localhost", "Content-Length": "3000001" },
      body: "{}",
    }),
  );
  expect(response.status).toBe(413);
  expect(journal).not.toHaveBeenCalled();
});

it("uses the configured public origin instead of a reconstructed or spoofed request host", async () => {
  const bad = new NextRequest("https://attacker.example/api/records", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
    body: "{}",
  });
  expect((await POST(bad)).status).toBe(403);
  expect(authenticated).not.toHaveBeenCalled();
  vi.mocked(journal).mockResolvedValue({
    mutate: vi.fn().mockResolvedValue({ ok: true }),
  } as never);
  const good = new NextRequest("http://internal:3000/api/records", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body: JSON.stringify({ action: "profile", payload: {} }),
  });
  expect((await POST(good)).status).toBe(200);
});

it("downloads raw MyShotLog backups and pages birth context without evaluations", async () => {
  const fixtures = await import("./fixtures");
  vi.mocked(records).mockResolvedValue({
    profile: fixtures.profile,
    firearms: [fixtures.firearm],
    sessions: [fixtures.session],
    assessments: [],
  });
  vi.mocked(journal).mockResolvedValue({ photos: async () => [] } as never);
  const response = await GET(
    new NextRequest("http://localhost/api/records?format=json"),
  );
  expect(response.headers.get("Content-Disposition")).toContain(
    "myshotlog-v2.json",
  );
  const data = await response.json();
  expect(data).toMatchObject({ format: "myshotlog", version: 2 });
  expect(data).not.toHaveProperty("assessments");
  const page = await GET(
    new NextRequest("http://localhost/api/records?part=recordingContexts"),
  );
  expect(await page.json()).toEqual(data.recordingContexts);
});
