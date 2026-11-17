import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { privateJson } from "../lib/sync/response";

it("produces plain JSON for a large private snapshot so the HTTP server can compress it", async () => {
  const records = { fixture: "repeated structured data ".repeat(10000) };
  const response = privateJson(records);
  expect(response.headers.has("content-encoding")).toBe(false);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual(records);
});

it("returns the private JSON error, status and retry header", async () => {
  const value = { error: "rateLimited" };
  const response = privateJson(value, 429, { "Retry-After": "30" });
  expect(response.headers.has("content-encoding")).toBe(false);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("30");
  expect(await response.json()).toEqual(value);
});
