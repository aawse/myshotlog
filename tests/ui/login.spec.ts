import { test, expect } from "./fixture";
import { expectLayout } from "./layout";
import sv from "../../lib/locales/sv.json";
import en from "../../lib/locales/en.json";
for (const language of ["sv", "en"] as const) {
  test(`login follows the real OAuth redirect under CSP without duplicate requests (${language})`, async ({
    page,
    journal,
  }) => {
    const labels = language === "sv" ? sv : en;
    journal.setLanguage(language);
    await page.goto("/settings/");
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await page.waitForLoadState("networkidle");
    const login = await page.goto("/login/");
    expect(login?.headers()["content-security-policy"]).toContain(
      "form-action 'self'",
    );
    expect(login?.headers()["content-security-policy"]).not.toContain(
      "github.com",
    );
    let providerRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/login/oauth/authorize") {
        providerRequests++;
        expect(url.hostname).toBe("127.0.0.1");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("state")).toBeTruthy();
      }
    });
    const button = page.getByRole("button", {
      name: labels["login.github"],
      exact: true,
    });
    await expect(button).toBeEnabled();
    const start = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/auth/github/",
    );
    await button.click();
    const response = await start;
    expect(response.status()).toBe(307);
    // WebKit does not expose all redirect response headers. Assert the actual
    // navigation; the test proxy rejects destinations other than GitHub.
    await expect(page).toHaveURL(
      /^http:\/\/127\.0\.0\.1:\d+\/login\/oauth\/authorize\?/,
    );
    const provider = new URL(page.url());
    expect(provider.origin).not.toBe(new URL(login?.url() ?? "").origin);
    expect(provider.searchParams.get("code_challenge_method")).toBe("S256");
    await expect(
      page.getByText("Fictional GitHub authorization"),
    ).toBeVisible();
    expect(providerRequests).toBe(1);
    await page.goto("/login/?error=oauth");
    await expect(page.locator('.notice[role="alert"]')).toHaveText(
      labels["login.failed"],
    );
    await expect(button).toBeEnabled();
    await expectLayout(page);
    await page.screenshot({
      path: test.info().outputPath(`login-${language}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await expectLayout(page);
    await page.screenshot({
      path: test.info().outputPath(`login-320-${language}.png`),
      fullPage: true,
    });
  });
}
