import { vi, it, expect, beforeEach } from "vitest";
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: vi.fn(),
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: () => ({ siteUrl: "https://myshotlog.example" }),
}));
vi.mock("../lib/data", () => ({ records: vi.fn() }));
vi.mock("../lib/pdf/session", () => ({ createSessionPdf: vi.fn() }));
const limitApi = vi.hoisted(() => vi.fn());
vi.mock("../lib/auth/security", () => ({
  securityStore: () => ({ limitApi }),
}));
import { authenticated } from "../lib/auth/server";
import { records } from "../lib/data";
import { createSessionPdf } from "../lib/pdf/session";
import { RateLimited } from "../lib/auth/security-store";
import { GET } from "../app/api/sessions/[id]/pdf/route";
import { profile, session } from "./fixtures";
const request = (id = session.id) =>
  GET(new Request("https://myshotlog.example/api/sessions/" + id + "/pdf/"), {
    params: Promise.resolve({ id }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "owner", githubId: "12345", login: "user" },
  });
  vi.mocked(records).mockResolvedValue({
    profile,
    firearms: [],
    sessions: [session],
    assessments: [],
  });
  vi.mocked(createSessionPdf).mockResolvedValue(
    new Uint8Array(Buffer.from("%PDF-test")),
  );
});
it("downloads the owner's PDF with a canonical URL and private headers", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/pdf");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Content-Disposition")).toContain(
    `myshotlog-${session.date}-${session.id}.pdf`,
  );
  expect(createSessionPdf).toHaveBeenCalledWith(
    expect.anything(),
    session,
    `https://myshotlog.example/sessions/${session.id}/`,
  );
  expect(await response.text()).toBe("%PDF-test");
});
it("requires authentication before accessing journal records", async () => {
  vi.mocked(authenticated).mockRejectedValue(new Error("AUTH_REQUIRED"));
  expect((await request()).status).toBe(401);
  expect(records).not.toHaveBeenCalled();
  expect(createSessionPdf).not.toHaveBeenCalled();
});
it("rate limits before generating a PDF", async () => {
  limitApi.mockRejectedValue(new RateLimited(60));
  const response = await request();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(records).not.toHaveBeenCalled();
});
it("does not export missing sessions or invalid IDs", async () => {
  expect((await request("../profile")).status).toBe(404);
  expect(records).not.toHaveBeenCalled();
  expect((await request("40000000-0000-4000-8000-000000000000")).status).toBe(
    404,
  );
  expect(createSessionPdf).not.toHaveBeenCalled();
});
it("returns a private generic failure without leaking journal or server details", async () => {
  vi.mocked(createSessionPdf).mockRejectedValue(new Error("SECRET"));
  const response = await request();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.text()).toBe("");
});
