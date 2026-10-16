import { test, expect } from "./fixture";
import { expectLayout } from "./layout";
import sv from "../../lib/locales/sv.json";
import en from "../../lib/locales/en.json";
for (const language of ["sv", "en"] as const) {
  test(`login blocks repeated submissions and shows progress (${language})`, async ({
    page,
    journal,
  }) => {
    const labels = language === "sv" ? sv : en;
    journal.setLanguage(language);
    await page.goto("/settings/");
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await page.waitForLoadState("networkidle");
    await page.goto("/login/");
    let requests = 0;
    await page.route("**/auth/github/**", async (route) => {
      requests++;
      await route.fulfill({
        contentType: "text/html",
        body: "<main>Fictional GitHub sign-in</main>",
      });
    });
    const button = page.getByRole("button", {
      name: labels["login.github"],
      exact: true,
    });
    await expect(button).toBeEnabled();
    // Observe native submissions after React's handler, holding navigation so
    // the busy screen remains inspectable across browser engines.
    await page.evaluate(() => {
      const intercept = (event: SubmitEvent) => {
        if (!(event.target instanceof HTMLFormElement)) return;
        if (!event.defaultPrevented)
          event.target.dataset.allowedSubmissions = String(
            Number(event.target.dataset.allowedSubmissions ?? 0) + 1,
          );
        event.preventDefault();
      };
      window.addEventListener("submit", intercept);
      window.addEventListener(
        "allow-login-navigation",
        () => window.removeEventListener("submit", intercept),
        { once: true },
      );
    });
    await button.click();
    const pending = page.getByRole("button", {
      name: labels["login.connecting"],
      exact: true,
    });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("status")).toHaveText(
      labels["login.connecting"],
    );
    const form = page.locator('form[action="/auth/github/"]');
    await form.evaluate((form) => {
      if (!(form instanceof HTMLFormElement))
        throw new Error("Missing login form");
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(form).toHaveAttribute("data-allowed-submissions", "1");
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
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      window.dispatchEvent(new Event("allow-login-navigation"));
    });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page).toHaveURL(/\/auth\/github\/\??$/);
    await page.goto("/login/?error=oauth");
    await expect(page.locator('.notice[role="alert"]')).toHaveText(
      labels["login.failed"],
    );
    await expect(button).toBeEnabled();
    expect(requests).toBe(1);
  });
}
