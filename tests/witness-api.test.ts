import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  cancel: vi.fn(),
  preview: vi.fn(),
  sign: vi.fn(),
  limitApi: vi.fn(),
  limitWitness: vi.fn(),
  anonymous: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("../lib/auth/server", () => ({
  AuthenticationRequired: class extends Error {},
  authenticated: vi.fn(),
}));
vi.mock("../lib/auth/github", () => ({
  oauthConfig: () => ({ siteUrl: "https://example.test" }),
}));
vi.mock("../lib/auth/security", () => ({
  securityStore: () => mock,
  clientAddress: () => "client",
}));
vi.mock("../lib/witness/server", () => ({
  ownerWitnessStore: mock.owner,
  anonymousWitnessStore: mock.anonymous,
}));
import { authenticated, AuthenticationRequired } from "../lib/auth/server";
import { WitnessUnavailable } from "../lib/witness/store";
import { RateLimited } from "../lib/auth/security-store";
import { POST } from "../app/api/witness/route";
import { session } from "./fixtures";
const request = (body: unknown, origin = "https://example.test") =>
  new Request("https://example.test/api/witness/", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authenticated).mockResolvedValue({
    user: { id: "owner", githubId: "1", login: "test" },
  });
  mock.owner.mockResolvedValue(mock);
  mock.anonymous.mockReturnValue(mock);
  mock.preview.mockResolvedValue({ snapshot: { date: session.date } });
});
it("requires owner authentication for creating and cancelling invitations", async () => {
  vi.mocked(authenticated).mockRejectedValue(new AuthenticationRequired());
  expect(
    (
      await POST(
        request({ action: "create", sessionId: session.id, resultId: null }),
      )
    ).status,
  ).toBe(401);
  expect(
    (await POST(request({ action: "cancel", id: session.id }))).status,
  ).toBe(401);
  expect(mock.owner).not.toHaveBeenCalled();
});
it("allows a capability holder to preview without a login and returns private no-store data", async () => {
  const response = await POST(
    request({ action: "preview", token: "example-token" }),
  );
  expect(response.status).toBe(200);
  expect(authenticated).not.toHaveBeenCalled();
  expect(mock.limitWitness).toHaveBeenCalledWith("client");
  expect(mock.preview).toHaveBeenCalledWith("example-token");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
it("checks Origin before token lookup, body parsing and storage access", async () => {
  expect(
    (
      await POST(
        request({ action: "preview", token: "secret" }, "https://other.test"),
      )
    ).status,
  ).toBe(403);
  expect(mock.anonymous).not.toHaveBeenCalled();
  expect(mock.preview).not.toHaveBeenCalled();
});
it("rejects extra fields, unconfirmed signatures and oversized requests", async () => {
  expect(
    (
      await POST(
        request({ action: "preview", token: "secret", ownerId: "attacker" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          action: "sign",
          token: "secret",
          name: "Witness",
          language: "en",
          confirmed: false,
          signature: {},
        }),
      )
    ).status,
  ).toBe(400);
  const huge = new Request("https://example.test/api/witness/", {
    method: "POST",
    headers: { origin: "https://example.test", "content-length": "160001" },
    body: "{}",
  });
  expect((await POST(huge)).status).toBe(413);
  expect(mock.preview).not.toHaveBeenCalled();
});
it("returns the same closed-link response for cancelled, expired and missing capabilities", async () => {
  mock.anonymous.mockImplementation(() => {
    throw new WitnessUnavailable();
  });
  expect(
    (await POST(request({ action: "preview", token: "invalid" }))).status,
  ).toBe(410);
});
it("limits anonymous traffic before journal access", async () => {
  mock.limitWitness.mockRejectedValue(new RateLimited(30));
  const response = await POST(request({ action: "preview", token: "valid" }));
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("30");
  expect(mock.preview).not.toHaveBeenCalled();
});
