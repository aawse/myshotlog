import { it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { clientAddress } from "../lib/auth/security";
afterEach(() => vi.unstubAllEnvs());
it("ignores spoofed IP headers unless the deployment supplies a trusted proxy", () => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("AUTH_TRUSTED_IP_HEADER", "");
  const request = new Request("https://example.test", {
    headers: {
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "1.2.3.4",
      "x-vercel-forwarded-for": "1.2.3.4",
    },
  });
  expect(clientAddress(request)).toBe("shared");
  vi.stubEnv("VERCEL", "1");
  expect(clientAddress(request)).toBe("1.2.3.4");
  expect(
    clientAddress(
      new Request("https://example.test", {
        headers: { "x-vercel-forwarded-for": "not-an-ip" },
      }),
    ),
  ).toBe("shared");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("AUTH_TRUSTED_IP_HEADER", "x-real-ip");
  expect(clientAddress(request)).toBe("1.2.3.4");
});
