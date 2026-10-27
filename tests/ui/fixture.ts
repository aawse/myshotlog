import { test as base, expect } from "@playwright/test";
import { signSession } from "../../lib/auth/session";
import { project, batchSchema } from "../../lib/sync/model";
import type { Records } from "../../lib/models";
import { profile, firearm, session } from "../fixtures";
import { recordSeries } from "../../lib/rules/recorded";
import {
  captureWithCspEvent,
  isScreenshotStyle,
  type CspViolation,
} from "./csp-monitor";
export const uiSigningKey =
  "myshotlog-ui-only-signing-key-not-for-real-deployments-0123456789";
export const uiOrigin = "https://ui.myshotlog.test";
type Journal = {
  setLanguage: (language: "sv" | "en") => void;
  readonly writes: number;
  readonly records: Records;
};
export const test = base.extend<{
  journal: Journal;
  browserErrors: void;
  expectedCspDirectives: string[];
}>({
  expectedCspDirectives: [[], { option: true }],
  journal: [
    async ({ context, baseURL }, use, testInfo) => {
      if (!baseURL) throw new Error("UI test baseURL is required");
      await context.setExtraHTTPHeaders({
        "x-ui-client-ip":
          "192.0.2." +
          (testInfo.config.projects.findIndex(
            (project) => project.name === testInfo.project.name,
          ) +
            1),
      });
      let writes = 0;
      let records: Records = {
        profile: { ...profile, displayName: "Fixture Shooter" },
        firearms: [
          {
            ...firearm,
            make: "Fixture",
            model: "Precision",
            serial: "",
            caliber: ".22 LR",
            defaultDiscipline: "precision",
            firearmType: "pistol",
            hasOptic: false,
          },
        ],
        sessions: [
          {
            ...session,
            location: "Fixture Range",
            firearmSnapshot: {
              id: firearm.id,
              group: "C",
              nickname: "",
              make: "Fixture",
              model: "Precision",
              caliber: ".22 LR",
            },
          },
        ],
        assessments: [],
        quickEntries: [],
        witnessSignoffs: [],
      };
      records.assessments = records.sessions
        .flatMap((session) =>
          session.results.flatMap((result) =>
            recordSeries(session, result, records.profile, []),
          ),
        )
        .map((assessment, index) => ({
          ...assessment,
          id:
            "30000000-0000-4000-8000-" +
            (index + 1).toString(16).padStart(12, "0"),
          createdAt: "2026-10-10T12:00:00Z",
        }));
      await context.addCookies([
        {
          name: "myshotlog_session",
          value: signSession(
            { githubId: "111", login: "ui-fixture" },
            uiSigningKey,
            uiOrigin,
          ),
          url: baseURL,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const origin = new URL(baseURL).origin;
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin === origin &&
          (url.protocol === "http:" || url.protocol === "blob:")
          ? route.fallback()
          : route.abort();
      });
      await context.route("**/api/**", (route) =>
        route.fulfill({
          status: 503,
          json: { error: "UI fixture: unexpected API request" },
        }),
      );
      await context.route("**/api/updates/**", (route) =>
        route.fulfill({ json: { status: "unavailable" } }),
      );
      await context.route("**/api/rules/**", (route) =>
        route.fulfill({
          json: { status: "current", checkedAt: "2026-10-15T12:00:00Z" },
        }),
      );
      await context.route("**/api/witness/**", (route) =>
        route.fulfill({ json: { invitations: [] } }),
      );
      await context.route("**/api/sync/**", async (route) => {
        const request = route.request();
        const payload =
          request.method() === "POST"
            ? batchSchema.parse(request.postDataJSON())
            : null;
        const scope =
          payload?.scope ?? new URL(request.url()).searchParams.get("scope");
        const operations = payload?.operations ?? [];
        if (payload) {
          records = project(records, operations);
          writes++;
        }
        await route.fulfill({
          json: {
            scope,
            head: writes.toString(16).padStart(40, "0"),
            records,
            ...(payload
              ? { acknowledged: operations.map((operation) => operation.id) }
              : {}),
          },
        });
      });
      await use({
        setLanguage: (language) => {
          records.profile.language = language;
        },
        get writes() {
          return writes;
        },
        get records() {
          return records;
        },
      });
    },
    { auto: true },
  ],
  browserErrors: [
    async (
      { page, context, baseURL, browserName, expectedCspDirectives },
      use,
    ) => {
      const errors: string[] = [];
      const violations: string[] = [];
      let screenshotStyleAllowance = 0;
      const screenshot = page.screenshot.bind(page);
      page.screenshot = async (options) => {
        // WebKit's Playwright screenshotter injects and removes `body {}` at
        // line 5 of its utility script to synchronize animations. Keep CSP
        // enforced; recognize only that blocked tooling style during capture.
        screenshotStyleAllowance = browserName === "webkit" ? 1 : 0;
        try {
          if (browserName !== "webkit") return await screenshot(options);
          const blockedStyle = page.waitForEvent("console", {
            predicate: (message) =>
              message.text().startsWith("MYSHOTLOG_CSP_VIOLATION:") &&
              isScreenshotStyle(
                JSON.parse(
                  message.text().slice("MYSHOTLOG_CSP_VIOLATION:".length),
                ) as CspViolation,
              ),
          });
          return await captureWithCspEvent(
            () => screenshot(options),
            blockedStyle,
          );
        } finally {
          screenshotStyleAllowance = 0;
        }
      };
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          console.error(
            "MYSHOTLOG_CSP_VIOLATION:" +
              JSON.stringify({
                directive: event.effectiveDirective.startsWith("script-src")
                  ? "script-src"
                  : event.effectiveDirective,
                source: event.sourceFile,
                line: event.lineNumber,
                blocked: event.blockedURI,
              }),
          );
        });
      });
      page.on("console", (message) => {
        if (
          message.type() !== "error" ||
          !message.text().startsWith("MYSHOTLOG_CSP_VIOLATION:")
        )
          return;
        const violation = JSON.parse(
          message.text().slice("MYSHOTLOG_CSP_VIOLATION:".length),
        ) as CspViolation;
        if (screenshotStyleAllowance && isScreenshotStyle(violation)) {
          screenshotStyleAllowance--;
          return;
        }
        violations.push(violation.directive);
      });
      page.on("request", (request) => {
        const url = new URL(request.url());
        const localProvider =
          url.protocol === "http:" &&
          url.hostname === "127.0.0.1" &&
          url.pathname === "/login/oauth/authorize";
        if (url.origin !== new URL(baseURL ?? "").origin && !localProvider)
          errors.push("Unexpected external request: " + url.origin);
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors).toEqual([]);
      expect(violations.sort()).toEqual([...expectedCspDirectives].sort());
    },
    { auto: true },
  ],
});
export { expect };
