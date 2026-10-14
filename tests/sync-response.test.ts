import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { gunzipSync } from "node:zlib";
import { privateJson } from "../lib/sync/response";
it("compresses large private snapshots for browsers without exposing them to shared caches", async () => {
  const records = { fixture: "repeated structured data ".repeat(10000) };
  const response = await privateJson(
    new Request("https://journal.example/api/sync/", {
      headers: { "Accept-Encoding": "gzip, deflate, br" },
    }),
    records,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.length).toBeLessThan(10000);
  expect(JSON.parse(gunzipSync(bytes).toString())).toEqual(records);
  expect(response.headers.get("content-encoding")).toBe("gzip");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Accept-Encoding");
});
it("honors clients that decline gzip and keeps small checkpoint/error responses plain JSON", async () => {
  const value = { fixture: "large data ".repeat(10000) };
  const declined = await privateJson(
    new Request("https://journal.example/", {
      headers: { "Accept-Encoding": "gzip;q=0, br" },
    }),
    value,
  );
  expect(declined.headers.has("content-encoding")).toBe(false);
  expect(await declined.json()).toEqual(value);
  const small = await privateJson(
    new Request("https://journal.example/", {
      headers: { "Accept-Encoding": "gzip" },
    }),
    { error: "rateLimited" },
    429,
    { "Retry-After": "30" },
  );
  expect(small.headers.has("content-encoding")).toBe(false);
  expect(small.status).toBe(429);
  expect(small.headers.get("retry-after")).toBe("30");
});
