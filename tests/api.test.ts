import { vi, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: vi.fn(),
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: () => ({
    siteUrl: "http://localhost",
    secret: "fictional-import-api-key-at-least-32-bytes",
  }),
}));
const staging = vi.hoisted(() => ({ snapshot: vi.fn(), publish: vi.fn() }));
vi.mock("../lib/git-database/config", () => ({
  database: () => staging,
  databasePrefix: () => "test/v1",
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
  staging.snapshot.mockResolvedValue({ head: null, files: new Map() });
  staging.publish.mockResolvedValue({ head: null, commits: [] });
  vi.mocked(authenticated).mockResolvedValue({
    user: {
      id: "20000000-0000-4000-8000-000000000001",
      githubId: "12345",
      login: "user",
    },
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

it("reads one owner-selected photo without loading the full journal or photo collection", async () => {
  const photo = vi.fn().mockResolvedValue({ id: "a".repeat(64) });
  vi.mocked(journal).mockResolvedValue({ photo } as never);
  const response = await GET(
    new NextRequest("http://localhost/api/records?photo=" + "a".repeat(64)),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(photo).toHaveBeenCalledWith("a".repeat(64));
  expect(records).not.toHaveBeenCalled();
  expect(
    (await GET(new NextRequest("http://localhost/api/records?photo=../other")))
      .status,
  ).toBe(400);
});
it("stages imports only under the verified owner and denies incomplete finalization", async () => {
  const send = (
    action: string,
    payload: unknown,
    origin = "http://localhost",
  ) =>
    POST(
      new NextRequest("http://localhost/api/records", {
        method: "POST",
        headers: { origin },
        body: JSON.stringify({ action, payload }),
      }),
    );
  const payload = {
    id: "30000000-0000-4000-8000-000000000001",
    bytes: 10,
    hash: "a".repeat(64),
  };
  expect(
    (await send("import-start", payload, "https://attacker.test")).status,
  ).toBe(403);
  expect(staging.snapshot).not.toHaveBeenCalled();
  expect(
    (await send("import-start", { ...payload, owner: "other" })).status,
  ).toBe(400);
  expect((await send("import-start", payload)).status).toBe(200);
  expect(staging.snapshot).toHaveBeenCalledWith(
    "test/v1/imports/users/20000000-0000-4000-8000-000000000001",
  );
  expect((await send("import-finish", { id: payload.id })).status).toBe(400);
  expect(journal).not.toHaveBeenCalled();
  vi.mocked(authenticated).mockRejectedValue(new Error("AUTH_REQUIRED"));
  expect((await send("import-chunk", {})).status).toBe(401);
  expect((await send("import-finish", { id: payload.id })).status).toBe(401);
});
