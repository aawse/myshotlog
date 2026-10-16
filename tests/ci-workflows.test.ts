import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const tests = readFileSync(".github/workflows/tests.yml", "utf8");
const uiTests = readFileSync(".github/workflows/ui-tests.yml", "utf8");

it("runs browser tests independently from the unit and build checks", () => {
  for (const command of [
    "npm test",
    "npm run typecheck",
    "npm run format:check",
    "npm run build",
  ]) {
    expect(tests).toContain(`run: ${command}\n`);
    expect(uiTests).not.toContain(`run: ${command}\n`);
  }
  expect(tests).not.toContain("test:ui");
  expect(tests).not.toContain("actions/upload-artifact@");
  expect(uiTests).toContain("run: npm run test:ui:install\n");
  expect(uiTests).toContain("run: npm run test:ui\n");
  expect(uiTests).not.toMatch(/UI_SKIP_BUILD|needs:|workflow_run:/);
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
