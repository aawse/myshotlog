import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3096",
    locale: "sv-SE",
    timezoneId: "Europe/Stockholm",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "desktop-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1366, height: 900 },
      },
    },
    {
      name: "desktop-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
    { name: "ios-safari", use: { ...devices["iPhone 13"] } },
    { name: "ipad-safari", use: { ...devices["iPad Mini"] } },
  ],
  webServer: {
    command:
      (process.env.UI_SKIP_BUILD === "1" ? "" : "npm run build && ") +
      "node scripts/ui-server.mjs",
    url: "http://127.0.0.1:3096",
    reuseExistingServer: false,
    timeout: 180000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    env: {
      VERCEL: "0",
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://ui.myshotlog.test",
      AUTH_SESSION_SECRET:
        "myshotlog-ui-only-signing-key-not-for-real-deployments-0123456789",
      GITHUB_CLIENT_ID: "ui-fixture",
      GITHUB_CLIENT_SECRET: "ui-fixture",
      GITHUB_ALLOWED_USER_IDS: "111",
      GITHUB_USER_ID_MAP: "{}",
      AUTH_TRUSTED_IP_HEADER: "x-ui-client-ip",
      GIT_DATABASE_PROVIDER: "git",
      GIT_DATABASE_REPOSITORY: "fictional-myshotlog/ui-data",
      GIT_DATABASE_TOKEN: "ui-fixture-not-a-real-token",
      GIT_DATABASE_BRANCH: "main",
      GIT_DATABASE_PREFIX: "myshotlog/ui-tests",
      GIT_DATABASE_API_URL: "https://api.github.com",
    },
  },
});
