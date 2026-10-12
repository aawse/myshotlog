import { it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
afterEach(() => vi.unstubAllEnvs());
it("uses fresh production nonces, overrides forged headers and blocks executable inline content", () => {
  vi.stubEnv("NODE_ENV", "production");
  const a = proxy(
      new NextRequest("https://example.test", {
        headers: {
          "x-nonce": "forged",
          "Content-Security-Policy": "script-src *",
        },
      }),
    ),
    b = proxy(new NextRequest("https://example.test"));
  const csp = a.headers.get("Content-Security-Policy")!;
  expect(csp).not.toBe(b.headers.get("Content-Security-Policy"));
  expect(csp).toContain("'strict-dynamic'");
  expect(
    csp.split(";").find((v) => v.trim().startsWith("script-src")),
  ).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("img-src 'self' blob: data:");
  expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(
    csp,
  );
  expect(a.headers.get("x-middleware-request-x-nonce")).not.toBe("forged");
  expect(a.headers.get("Cache-Control")).toBe("private, no-store");
});
it("limits development relaxations to development and preserves local HTTP previews", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(
    proxy(new NextRequest("http://localhost:3000")).headers.get(
      "Content-Security-Policy",
    ),
  ).toContain("'unsafe-eval'");
  vi.stubEnv("NODE_ENV", "production");
  expect(
    proxy(new NextRequest("http://localhost:3000")).headers.get(
      "Content-Security-Policy",
    ),
  ).not.toContain("upgrade-insecure-requests");
});
it("does not clone API request bodies through Proxy", async () => {
  const { unstable_doesMiddlewareMatch } =
    await import("next/experimental/testing/server");
  const { config } = await import("../proxy");
  expect(
    unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "/api/records",
    }),
  ).toBe(false);
  expect(
    unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "/api/photos/image",
    }),
  ).toBe(false);
  expect(
    unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "/sessions/new",
    }),
  ).toBe(true);
});
