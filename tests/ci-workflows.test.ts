import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const tests = readFileSync(".github/workflows/tests.yml", "utf8");
const uiTests = readFileSync(".github/workflows/ui-tests.yml", "utf8");

it("builds the UI fixture once and shares it across the independent browser matrix", () => {
  for (const command of [
    "npm test",
    "npm run typecheck",
    "npm run format:check",
  ]) {
    expect(tests).toContain(`run: ${command}\n`);
    expect(uiTests).not.toContain(`run: ${command}\n`);
  }
  expect(tests).toContain("run: npm run build\n");
  expect(tests).not.toContain("test:ui");
  expect(tests).not.toContain("actions/upload-artifact@");
  expect(uiTests.match(/run: npm run build\n/g)).toHaveLength(1);
  expect(uiTests).toContain("needs: build");
  expect(uiTests).toContain("fail-fast: false");
  const config = readFileSync("playwright.config.ts", "utf8");
  const expectedProjects = [...config.matchAll(/name: "([^"]+)"/g)].map(
    ([, name]) => name,
  );
  const matrixProjects = [...uiTests.matchAll(/^ {10}- (\S+)$/gm)].map(
    ([, name]) => name,
  );
  expect(matrixProjects.sort()).toEqual(expectedProjects.sort());
  const siteUrl = config.match(/NEXT_PUBLIC_SITE_URL: "([^"]+)"/)?.[1];
  expect(siteUrl).toBeDefined();
  expect(uiTests).toContain(`NEXT_PUBLIC_SITE_URL: ${siteUrl}\n`);
  expect(uiTests).toContain('VERCEL: "0"');
  expect(uiTests).toContain("tar --exclude=.next/cache");
  expect(uiTests).toContain("uses: actions/download-artifact@");
  const playwrightVersion = readFileSync("package.json", "utf8").match(
    /"@playwright\/test": "([^"]+)"/,
  )?.[1];
  expect(playwrightVersion).toBeDefined();
  expect(uiTests).toContain(
    `image: mcr.microsoft.com/playwright:v${playwrightVersion}-noble@sha256:`,
  );
  expect(uiTests).toMatch(/@sha256:[a-f0-9]{64}\n/);
  expect(uiTests).not.toContain("playwright install");
  expect(uiTests).toContain('UI_SKIP_BUILD: "1"');
  expect(uiTests).toContain(
    'npm run test:ui -- --project="$PLAYWRIGHT_PROJECT"',
  );
  expect(uiTests).not.toContain("workflow_run:");
  expect(uiTests).toContain("name: Desktop and mobile browser UI");
  expect(uiTests).toContain("needs: [build, ui]");
  expect(uiTests).toContain(
    'test "$BUILD_RESULT" = success && test "$UI_RESULT" = success',
  );
});

it("keeps both workflows available for pull requests, main pushes and manual runs", () => {
  for (const workflow of [tests, uiTests]) {
    expect(workflow).toContain("  pull_request:\n");
    expect(workflow).toContain("  push:\n    branches:\n      - main\n");
    expect(workflow).toContain("  workflow_dispatch:\n");
    expect(workflow).toContain("permissions:\n  contents: read\n");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("pull_request_target");
    const actions = [...workflow.matchAll(/uses: (\S+)/g)];
    expect(actions.length).toBeGreaterThan(0);
    for (const [, action] of actions) {
      expect(action).toMatch(/@[a-f0-9]{40}$/);
    }
  }
});

it("retains browser failure reports for seven days", () => {
  expect(uiTests).toContain("if: failure()");
  expect(uiTests).toContain("uses: actions/upload-artifact@");
  expect(uiTests).toContain("playwright-report/");
  expect(uiTests).toContain("test-results/");
  expect(uiTests).toContain("retention-days: 7");
});
