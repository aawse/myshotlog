import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixture";
import { expectLayout } from "./layout";
import sv from "../../lib/locales/sv.json";
import en from "../../lib/locales/en.json";
import { batchSchema } from "../../lib/sync/model";
async function expectDock(page: Page) {
  const rectangles = await page
    .locator(".journal-tools .journal-tool-button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        };
      }),
    );
  expect(rectangles).toHaveLength(2);
  for (const box of rectangles) {
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.right).toBeLessThanOrEqual(box.viewportWidth - 8);
    expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight - 8);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(rectangles[0].right + 7).toBeLessThanOrEqual(rectangles[1].left);
  const obscured = await page.evaluate(() => {
    const dock = document
      .querySelector(".journal-tools")
      ?.getBoundingClientRect();
    const viewport = document.querySelector(".shell")?.getBoundingClientRect();
    if (!dock || !viewport) return true;
    return viewport.bottom > dock.top;
  });
  expect(obscured).toBe(false);
}
test("floating controls fit phone, tablet, desktop and landscape layouts without covering form actions", async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto("/sessions/new/");
  await expect(
    page.getByLabel(sv["session.location"], { exact: true }),
  ).toBeVisible();
  const save = page.getByRole("button", {
    name: sv["session.save"],
    exact: false,
  });
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      const viewport = document.querySelector(".shell");
      if (viewport instanceof HTMLElement)
        viewport.scrollTo(0, viewport.scrollHeight);
    });
    await expectDock(page);
    await expectLayout(page);
    const button = await save.boundingBox(),
      dock = await page.locator(".journal-tools").boundingBox();
    if (!button || !dock) throw new Error("Missing form or dock");
    expect(button.y + button.height).toBeLessThanOrEqual(dock.y);
    await save.click({ trial: true });
    if (viewport.width === 844)
      await page
        .locator('aside nav a[href="/settings/"]')
        .click({ trial: true });
    if (viewport.width === 1440)
      await page.screenshot({ path: testInfo.outputPath("desktop-dock.png") });
  }
  if (!isMobile) {
    const viewport = page.locator(".shell");
    await viewport.evaluate((node) => node.scrollTo(0, 0));
    await viewport.focus();
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => viewport.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .getByLabel(sv["session.location"], { exact: true })
    .fill("Fixture Range");
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches))
    await expect(page.locator(".journal-tools")).toBeHidden();
  await page.getByRole("heading").first().click();
  await expect(page.locator(".journal-tools")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("floating-tools.png"),
    fullPage: true,
  });
  await page.locator(".sync-trigger").click();
  const dialog = page.getByRole("dialog", { name: sv["sync.heading"] });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  if (!box) throw new Error("Missing sync dialog");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(812);
  await page.screenshot({ path: testInfo.outputPath("sync-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".sync-trigger")).toBeFocused();
});
test("offline changes remain downloadable and sync can be run from the compact dialog", async ({
  page,
  context,
  journal,
}) => {
  await page.goto("/quick/");
  await page.getByLabel(sv["session.points"], { exact: true }).fill("45");
  await context.setOffline(true);
  await page
    .getByRole("button", { name: sv["quick.saveNext"], exact: true })
    .click();
  await expect(page.locator(".quick-series-row")).toHaveCount(1);
  await page.getByRole("heading").first().click();
  await page.locator(".sync-trigger").click();
  const dialog = page.getByRole("dialog", { name: sv["sync.heading"] });
  await expect(
    dialog.getByText(sv["sync.pendingHelp"], { exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: sv["sync.backup"], exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("myshotlog-pending.json");
  const path = await download.path();
  if (!path) throw new Error("Missing backup download");
  const backup = JSON.parse(await readFile(path, "utf8")) as {
    format: string;
    operations: unknown[];
  };
  expect(backup.format).toBe("myshotlog-pending");
  expect(backup.operations).toHaveLength(1);
  await dialog
    .getByRole("button", { name: sv["common.close"], exact: true })
    .click();
  await context.setOffline(false);
  await expect.poll(() => journal.records.quickEntries?.length).toBe(1);
  await page.locator(".sync-trigger").click();
  const response = page.waitForResponse(
    (reply) =>
      new URL(reply.url()).pathname === "/api/sync/" &&
      reply.request().method() === "GET",
  );
  await dialog
    .getByRole("button", { name: sv["sync.now"], exact: true })
    .click();
  expect((await response).ok()).toBe(true);
  await expect(
    dialog.getByText(sv["sync.synced"], { exact: true }),
  ).toBeVisible();
  await dialog.getByText(sv["sync.browserOptions"], { exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: sv["sync.restore"], exact: true }),
  ).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"scope":"different-account"}'),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    sv["sync.restoreFailed"],
  );
  await expect(page.locator(".quick-series-row")).toHaveCount(1);
});
test("expired authentication removes an open feedback form and its draft", async ({
  page,
  context,
}) => {
  await page.goto("/sessions/");
  await page
    .getByRole("button", { name: sv["issues.report"], exact: true })
    .click();
  await page
    .getByLabel(sv["issues.title"], { exact: true })
    .fill("Fictional draft");
  await context.route("**/api/sync/**", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".issue-quick-button, .issue-dialog")).toHaveCount(
    0,
  );
  await expect(page.locator(".sync-trigger")).toContainText(
    sv["sync.compactAuthentication"],
  );
  await page.locator(".sync-trigger").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: sv["login.return"], exact: true }),
  ).toBeVisible();
});

for (const [keepDevice, language, messages] of [
  [true, "sv", sv],
  [false, "en", en],
] as const) {
  test(`conflicts can be reviewed and resolved with the ${keepDevice ? "device" : "server"} version`, async ({
    page,
    context,
    journal,
  }, testInfo) => {
    journal.setLanguage(language);
    await page.goto("/quick/");
    await page
      .getByLabel(messages["session.points"], { exact: true })
      .fill("45");
    const longNote = "Fictional practice note ".repeat(7).trim();
    await page.getByText(messages["quick.more"], { exact: true }).click();
    await page
      .getByLabel(messages["quick.note"], { exact: true })
      .fill(longNote);
    await context.setOffline(true);
    await page
      .getByRole("button", { name: messages["quick.saveNext"], exact: true })
      .click();
    await expect(page.locator(".quick-series-row")).toHaveCount(1);
    let conflicting = true;
    await context.route("**/api/sync/**", async (route) => {
      if (route.request().method() !== "POST" || !conflicting)
        return route.fallback();
      const batch = batchSchema.parse(route.request().postDataJSON());
      await route.fulfill({
        status: 409,
        json: {
          scope: batch.scope,
          head: batch.head,
          records: journal.records,
          conflict: {
            id: batch.operations[0].id,
            current: batch.operations[0].base,
          },
        },
      });
    });
    await context.setOffline(false);
    await page.getByRole("heading").first().click();
    await expect(page.locator(".sync-trigger")).toContainText(
      messages["sync.compactAttention"],
    );
    await page.locator(".sync-trigger").click();
    const dialog = page.getByRole("dialog", { name: messages["sync.heading"] });
    await expect(
      dialog.getByText(messages["sync.conflictHelp"], { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`sync-collapsed-${language}.png`),
    });
    await dialog.getByText(messages["sync.compare"], { exact: true }).click();
    await expect(
      dialog.getByRole("heading", {
        name: messages["sync.deviceVersion"],
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("heading", {
        name: messages["sync.serverVersion"],
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText(messages["session.points"], { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText(messages["sync.noRecord"], { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText(longNote, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`sync-expanded-${language}.png`),
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: testInfo.outputPath(`sync-320-expanded-${language}.png`),
    });
    const recheck = page.waitForResponse(
      (reply) =>
        new URL(reply.url()).pathname === "/api/sync/" &&
        reply.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: messages["sync.checkAgain"], exact: true })
      .click();
    expect((await recheck).status()).toBe(409);
    conflicting = false;
    await dialog
      .getByRole("button", {
        name: keepDevice
          ? messages["sync.keepDevice"]
          : messages["sync.keepServer"].replace("{count}", "1"),
        exact: true,
      })
      .click();
    await dialog
      .getByRole("button", {
        name: messages[
          keepDevice ? "sync.confirmDevice" : "sync.confirmDiscard"
        ],
        exact: true,
      })
      .click();
    await expect(
      dialog.getByText(messages["sync.synced"], { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".quick-series-row")).toHaveCount(
      keepDevice ? 1 : 0,
    );
    if (keepDevice)
      await expect.poll(() => journal.records.quickEntries?.length).toBe(1);
  });
}

test("explains a storage outage and provides a recovery path for a rejected change", async ({
  page,
  context,
  journal,
}) => {
  await page.goto("/quick/");
  await page.getByLabel(sv["session.points"], { exact: true }).fill("45");
  await context.setOffline(true);
  await page
    .getByRole("button", { name: sv["quick.saveNext"], exact: true })
    .click();
  await expect(page.locator(".quick-series-row")).toHaveCount(1);
  let unavailable = true;
  await context.route("**/api/sync/**", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (unavailable)
      return route.fulfill({ status: 503, json: { error: "unavailable" } });
    const batch = batchSchema.parse(route.request().postDataJSON());
    await route.fulfill({
      status: 409,
      json: {
        scope: batch.scope,
        head: batch.head,
        records: journal.records,
        conflict: { id: batch.operations[0].id, current: [], reason: "photo" },
      },
    });
  });
  await context.setOffline(false);
  await page.getByRole("heading").first().click();
  await expect(page.locator(".sync-trigger")).toContainText(
    sv["sync.compactAttention"],
  );
  await page.locator(".sync-trigger").click();
  const dialog = page.getByRole("dialog", { name: sv["sync.heading"] });
  await expect(
    dialog.getByText(sv["sync.unavailable"], { exact: true }),
  ).toBeVisible();
  unavailable = false;
  await dialog
    .getByRole("button", { name: sv["sync.now"], exact: true })
    .click();
  await expect(
    dialog.getByText(sv["sync.photoHelp"], { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: sv["sync.backup"], exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: sv["sync.keepDevice"], exact: true }),
  ).toHaveCount(0);
  const discard = dialog.getByRole("button", {
    name: sv["sync.discardRejected"].replace("{count}", "1"),
    exact: true,
  });
  await discard.click();
  await dialog
    .getByRole("button", { name: sv["common.cancel"], exact: true })
    .click();
  await expect(page.locator(".quick-series-row")).toHaveCount(1);
  await discard.click();
  await dialog
    .getByRole("button", { name: sv["sync.confirmDiscard"], exact: true })
    .click();
  await expect(
    dialog.getByText(sv["sync.synced"], { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quick-series-row")).toHaveCount(0);
});
