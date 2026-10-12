import { it, expect } from "vitest";
import {
  allowedUsers,
  legacyMapping,
  journalOwner,
  signSession,
  verifySession,
  sessionSeconds,
  seal,
} from "../lib/auth/session";
const secret = "s".repeat(32),
  origin = "https://myshotlog.example",
  identity = { githubId: "12345", login: "test-user" };
it("uses immutable GitHub IDs and supports explicit legacy migration", () => {
  expect(journalOwner(identity.githubId)).toMatch(/^[0-9a-f-]{36}$/);
  expect(journalOwner("12345")).not.toBe(journalOwner("12346"));
  const old = crypto.randomUUID();
  expect(journalOwner("12345", { "12345": old })).toBe(old);
  expect(() =>
    legacyMapping(JSON.stringify({ "123": old, "456": old })),
  ).toThrow();
  expect(() => allowedUsers("")).toThrow();
  expect(() => allowedUsers("123,123")).toThrow();
  expect(() => allowedUsers("../path")).toThrow();
  expect(allowedUsers("123, 456")).toEqual(["123", "456"]);
});
it("rejects tampering, expiry, wrong-purpose tokens and revoked access", () => {
  const now = Date.now(),
    token = signSession(identity, secret, origin, now);
  expect(verifySession(token, secret, origin, ["12345"], {}, now)).toEqual({
    ...identity,
    id: journalOwner("12345"),
  });
  expect(
    verifySession(token + "x", secret, origin, ["12345"], {}, now),
  ).toBeNull();
  expect(
    verifySession(
      token,
      secret,
      origin,
      ["12345"],
      {},
      now + sessionSeconds * 1000,
    ),
  ).toBeNull();
  expect(verifySession(token, secret, origin, [], {}, now)).toBeNull();
  expect(
    verifySession(token, "wrong".repeat(10), origin, ["12345"], {}, now),
  ).toBeNull();
  expect(
    verifySession(
      seal(
        {
          ...identity,
          purpose: "github-oauth",
          exp: Math.floor(now / 1000) + 60,
        },
        secret,
      ),
      secret,
      origin,
      ["12345"],
      {},
      now,
    ),
  ).toBeNull();
  expect(() => signSession(identity, "short", origin)).toThrow();
});
it("keeps ownership stable after username changes and applies updated mappings to existing sessions", () => {
  const old = crypto.randomUUID(),
    token = signSession({ ...identity, login: "renamed" }, secret, origin);
  expect(verifySession(token, secret, origin, ["12345"])?.id).toBe(
    journalOwner("12345"),
  );
  expect(
    verifySession(token, secret, origin, ["12345"], { "12345": old })?.id,
  ).toBe(old);
});

it("uses a distinct session ID even for the same user in the same second", () => {
  const now = Date.now();
  expect(signSession(identity, secret, origin, now)).not.toBe(
    signSession(identity, secret, origin, now),
  );
});

it("rejects other origins, legacy cookies and invalid issue/expiry windows", async () => {
  const { unseal } = await import("../lib/auth/session");
  const now = Date.now(),
    token = signSession(identity, secret, origin, now);
  expect(
    verifySession(token, secret, "https://other.example", ["12345"], {}, now),
  ).toBeNull();
  const claims = unseal(token, secret) as Record<string, unknown>;
  for (const invalid of [
    { ...claims, purpose: "github-session" },
    { ...claims, iat: Math.floor(now / 1000) + 60 },
    { ...claims, exp: Math.floor(now / 1000) + sessionSeconds + 1 },
    { ...claims, iat: claims.exp },
  ])
    expect(
      verifySession(seal(invalid, secret), secret, origin, ["12345"], {}, now),
    ).toBeNull();
});
