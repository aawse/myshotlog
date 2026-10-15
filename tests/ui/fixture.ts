import { test as base, expect } from "@playwright/test";
import { signSession } from "../../lib/auth/session";
import { project, batchSchema } from "../../lib/sync/model";
import type { Records } from "../../lib/models";
import { profile, firearm, session } from "../fixtures";
export const uiSigningKey =
  "myshotlog-ui-only-signing-key-not-for-real-deployments-0123456789";
export const uiOrigin = "https://ui.myshotlog.test";
type Journal = {
  setLanguage: (language: "sv" | "en") => void;
  readonly writes: number;
  readonly records: Records;
};
export const test = base.extend<{ journal: Journal; browserErrors: void }>({
  journal: [
    async ({ context, baseURL }, use) => {
      if (!baseURL) throw new Error("UI test baseURL is required");
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
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
