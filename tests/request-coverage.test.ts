import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
const coverage: Record<string, { methods: string[]; suite: string }> = {
  "api/records/route.ts": { methods: ["GET", "POST"], suite: "api.test.ts" },
  "api/sync/route.ts": { methods: ["GET", "POST"], suite: "sync-api.test.ts" },
  "api/witness/route.ts": {
    methods: ["GET", "POST"],
    suite: "witness-api.test.ts",
  },
  "api/photos/[id]/route.ts": { methods: ["GET"], suite: "photos.test.ts" },
  "api/sessions/[id]/pdf/route.ts": {
    methods: ["GET"],
    suite: "session-pdf-api.test.ts",
  },
  "api/installation/route.ts": {
    methods: ["GET"],
    suite: "installation-api.test.ts",
  },
  "api/repository-access/route.ts": {
    methods: ["GET"],
    suite: "repository-access-api.test.ts",
  },
  "api/rules/route.ts": { methods: ["GET"], suite: "rules-api.test.ts" },
  "api/updates/route.ts": { methods: ["GET"], suite: "updates-api.test.ts" },
  "auth/github/route.ts": { methods: ["GET"], suite: "oauth.test.ts" },
  "auth/github/callback/route.ts": { methods: ["GET"], suite: "oauth.test.ts" },
};
it("requires an exercised route-handler test for every exported HTTP request handler", async () => {
  const root = new URL("../app/", import.meta.url);
  const routes = (await readdir(root, { recursive: true }))
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => path === "route.ts" || path.endsWith("/route.ts"))
    .sort();
  expect(Object.keys(coverage).sort()).toEqual(routes);
  for (const path of routes) {
    const entry = coverage[path];
    const source = await readFile(new URL(path, root), "utf8");
    const methods = [
      ...source.matchAll(
        /export\s+(?:(?:async\s+)?function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
      ),
    ]
      .map((match) => match[1])
      .sort();
    expect(entry.methods.slice().sort(), path).toEqual(methods);
    const suite = await readFile(new URL(entry.suite, import.meta.url), "utf8");
    expect(suite, path).toContain("../app/" + path.replace(/\.ts$/, ""));
    for (const method of methods) {
      const alias =
        suite.match(new RegExp(`\\b${method}\\s+as\\s+(\\w+)`))?.[1] ?? method;
      expect(suite, `${method} ${path}`).toMatch(
        new RegExp(`\\b${alias}\\s*\\(`),
      );
    }
  }
});
