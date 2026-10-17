import { test, expect, uiOrigin } from "./fixture";
const id = "10000000-0000-4000-8000-000000000003";
const reads = [
  "/api/records/?photo=" + "a".repeat(64),
  "/api/photos/" + "a".repeat(64) + "/",
  `/api/sessions/${id}/pdf/`,
  "/api/sync/?scope=" + "a".repeat(64),
  "/api/rules/",
  "/api/updates/",
  "/api/installation/",
  "/api/repository-access/",
  `/api/witness/?sessionId=${id}`,
];
const writes = [
  { path: "/api/records/", data: { action: "profile", payload: {} } },
  { path: "/api/sync/", data: {} },
  {
    path: "/api/witness/",
    data: { action: "create", sessionId: id, resultId: null },
  },
];
test("every private request boundary denies anonymous reads and writes and rejects wrong Origins", async ({
  context,
}) => {
  await context.clearCookies();
  for (const path of reads) {
    for (const method of ["GET", "HEAD"]) {
      const response = await context.request.fetch(path, { method });
      expect(response.status(), `${method} ${path}`).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["x-frame-options"]).toBe("DENY");
    }
  }
  for (const { path, data } of writes) {
    const anonymous = await context.request.post(path, {
      headers: { Origin: uiOrigin },
      data,
    });
    expect(anonymous.status(), `POST ${path}`).toBe(401);
    expect(anonymous.headers()["cache-control"]).toContain("no-store");
    const wrongOrigin = await context.request.post(path, {
      headers: { Origin: "https://other.invalid" },
      data,
    });
    expect(wrongOrigin.status(), `Origin POST ${path}`).toBe(403);
  }
  const witness = await context.request.post("/api/witness/", {
    headers: { Origin: uiOrigin },
    data: { action: "preview", token: "fictional-invalid-capability" },
  });
  expect(witness.status()).toBe(410);
  const callback = await context.request.get("/auth/github/callback/", {
    maxRedirects: 0,
  });
  expect(callback.status()).toBe(307);
  expect(callback.headers()["location"]).toBe(uiOrigin + "/login/?error=oauth");
  expect(callback.headers()["cache-control"]).toContain("no-store");
});
