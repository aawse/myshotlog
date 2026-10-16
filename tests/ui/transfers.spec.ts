import { test, expect } from "./fixture";
import { expectLayout } from "./layout";
import sv from "../../lib/locales/sv.json";
import en from "../../lib/locales/en.json";
for (const language of ["sv", "en"] as const) {
  test(`export loader and download retain a usable layout (${language})`, async ({
    page,
    journal,
  }) => {
    journal.setLanguage(language);
    const labels = language === "sv" ? sv : en;
    const photoId = "a".repeat(64);
    journal.records.sessions[0].results[0].photoId = photoId;
    journal.records.profile.displayName =
      "Fictional shooter with a long display name for narrow screen review";
    let release: (() => void) | undefined;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/records/?photo=*", async (route) => {
      await paused;
      await route.fulfill({
        json: {
          id: photoId,
          mediaType: "image/jpeg",
          width: 1,
          height: 1,
          bytes: 3,
          data: "YWJj",
        },
      });
    });
    await page.goto("/settings/");
    const button = page.getByRole("button", {
      name: labels["profile.exportJson"],
      exact: true,
    });
    await expect(button).toBeEnabled();
    await button.click();
    const loader = page
      .locator(".loading-indicator")
      .filter({ hasText: labels["profile.preparingExport"] });
    await expect(loader).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(
      page.locator('.settings-sections input[type="file"]'),
    ).toBeDisabled();
    await expectLayout(page);
    await page.screenshot({
      path: test.info().outputPath(`export-${language}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await loader.scrollIntoViewIfNeeded();
    await expectLayout(page);
    for (const control of [
      button,
      loader,
      page.locator('.settings-sections input[type="file"]'),
    ]) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
    }
    await page.screenshot({
      path: test.info().outputPath(`export-320-${language}.png`),
      fullPage: true,
    });
    const download = page.waitForEvent("download");
    release?.();
    expect((await download).suggestedFilename()).toBe("myshotlog-v2.json");
    await expect(loader).toBeHidden();
    await expect(button).toBeEnabled();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: labels["profile.exportReady"] }),
    ).toBeVisible();
  });
}
