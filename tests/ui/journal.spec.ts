import { test, expect } from "./fixture";
import {
  expectLayout,
  expectMobileMetadata,
  expectReadableInput,
} from "./layout";
import sv from "../../lib/locales/sv.json";
import en from "../../lib/locales/en.json";
import { evaluate } from "../../lib/rules/engine";
import { signSession } from "../../lib/auth/session";
import { uiSigningKey, uiOrigin } from "./fixture";

for (const language of ["sv", "en"] as const) {
  const t = { sv, en }[language];
  test(`session editing, navigation and feedback (${language})`, async ({
    page,
    journal,
    isMobile,
  }) => {
    journal.setLanguage(language);
    await page.goto("/sessions/");
    await expect(
      page.getByRole("heading", { name: t["nav.sessions"], exact: true }),
    ).toBeVisible();
    await expectLayout(page);
    await expectMobileMetadata(page);
    await expect(page.getByRole("table").getByRole("cell")).toHaveCount(4);
    const counts = page.locator(".series-medals").first();
    await expect(counts).toBeVisible();
    if (isMobile) {
      const bounds = await counts.boundingBox();
      if (!bounds) throw new Error("Missing medal counts");
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        (page.viewportSize()?.width ?? 0) + 1,
      );
    }
    await page.locator(".session-list-row .row-title").first().click();
    await expect(
      page.locator('aside nav a[aria-current="location"]'),
    ).toBeVisible();
    await expect(page.locator(".session-rules")).toContainText(
      t["rules.edition21"],
    );
    await expect(page.locator(".session-rules")).toHaveCount(1);
    await expect(page.locator(".session-overview table")).toHaveCount(0);
    await expect(page.locator(".assessment")).toHaveCount(
      journal.records.sessions[0].results.length,
    );
    await expect(page.locator(".assessment-date")).toHaveCount(0);
    await page.locator(".assessment summary").first().click();
    const basis = page.locator(".assessment-basis").first();
    await expect(basis).toBeVisible();
    await expect(basis.locator("dt")).not.toContainText([t["common.date"]]);
    await expect(basis).toContainText(t["basis.recordedResult"]);
    await expect(basis.locator("pre")).toHaveCount(0);
    await expect(basis).toContainText(
      t["basis.age"].replace("{age}", "35").replace("{year}", "2025"),
    );
    await expect(basis).not.toContainText("1990");
    await expect(basis).not.toContainText("spsf-2026-21-badge-v1");
    await expectLayout(page);
    await page.screenshot({
      path: test.info().outputPath(`assessment-${language}.png`),
      fullPage: true,
    });
    await basis.locator(".assessment-comparison").scrollIntoViewIfNeeded();
    await expect(basis.locator(".assessment-comparison")).toContainText(
      t["rules.precisionScore"]
        .replace("{points}", "46")
        .replace("{threshold}", "46"),
    );
    await page.screenshot({
      path: test.info().outputPath(`assessment-result-${language}.png`),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: t["session.editHeading"], exact: true })
      .click();
    await page
      .getByLabel(t["session.location"], { exact: true })
      .fill("Fixture Range North");
    await expectReadableInput(page, '.form input[type="date"]', isMobile);
    await page
      .getByRole("button", { name: t["session.save"], exact: false })
      .click();
    await expect(page).toHaveURL(/\/sessions\/$/);
    await expect(page.getByText(/Fixture Range North/)).toBeVisible();
    await expect.poll(() => journal.writes).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByText(/Fixture Range North/)).toBeVisible();
    await page
      .getByRole("button", { name: t["issues.report"], exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: t["common.close"], exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await page
      .getByRole("button", { name: t["issues.report"], exact: true })
      .click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expectLayout(page);
  });
}

test("quick entry survives temporary disconnection and synchronizes after reconnect", async ({
  page,
  context,
  journal,
}) => {
  await page.goto("/quick/");
  await expect(
    page.getByLabel(sv["session.points"], { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel(sv["session.points"], { exact: true }).fill("45");
  await page
    .getByRole("button", { name: sv["quick.saveNext"], exact: true })
    .click();
  await expect(
    page.getByText(sv["quick.saved"], { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quick-series-row")).toHaveCount(1);
  await context.setOffline(false);
  await expect.poll(() => journal.records.quickEntries?.length).toBe(1);
  await page.reload();
  await expect(page.locator(".quick-series-row")).toHaveCount(1);
  await expectLayout(page);
});

for (const account of ["unauthenticated", "disallowed"] as const) {
  test(`${account} accounts cannot open a journal`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.clearCookies();
    if (account === "disallowed") {
      if (!baseURL) throw new Error("Missing UI baseURL");
      await context.addCookies([
        {
          name: "myshotlog_session",
          value: signSession(
            { githubId: "999", login: "disallowed" },
            uiSigningKey,
            uiOrigin,
          ),
          url: baseURL,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
    await page.goto(
      account === "unauthenticated" ? "/sessions/" : "/settings/",
    );
    await expect(page).toHaveURL(/\/login\/$/);
    await expect(
      page.getByRole("heading", { name: sv["login.heading"], exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".issue-quick-button, .issue-dialog, .journal-tools"),
    ).toHaveCount(0);
    const response = await context.request.get(
      "/api/sync/?scope=" + "a".repeat(64),
    );
    expect(response.status()).toBe(401);
  });
}

test("narrow screens retain usable navigation and results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/sessions/");
  await expect(page.locator(".session-list-row")).toHaveCount(1);
  await expectLayout(page);
  await page.locator(".session-list-row .row-title").first().click();
  await page.locator(".assessment summary").first().click();
  await expect(page.locator(".assessment-basis").first()).toBeVisible();
  await expectLayout(page);
  await page
    .locator("aside nav")
    .getByRole("link", { name: sv["nav.settings"], exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: sv["nav.settings"], exact: true }),
  ).toBeVisible();
  await expectLayout(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectLayout(page);
});

for (const language of ["sv", "en"] as const) {
  test(`compact assessment rows retain results and keyboard access (${language})`, async ({
    page,
    journal,
  }) => {
    journal.setLanguage(language);
    const session = journal.records.sessions[0];
    const template = session.results[0];
    session.results = Array.from({ length: 8 }, (_, index) => ({
      ...template,
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      label:
        index === 7
          ? "Fixture long series name that should wrap without hiding any of its content"
          : `Serie ${index + 1}`,
      points: index === 6 ? 20 : 46,
    }));
    journal.records.assessments = session.results
      .flatMap((result) => evaluate(session, result, journal.records.profile))
      .map((assessment, index) => ({
        ...assessment,
        id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        createdAt: "2026-10-10T12:00:00Z",
      }));
    await page.goto(`/sessions/${session.id}/`);
    const rows = page.locator(".assessment");
    await expect(rows).toHaveCount(8);
    await expect(page.locator(".assessment details[open]")).toHaveCount(0);
    const first = rows.first().locator("summary");
    await expect(first).toContainText("Serie 1");
    await expect(first).toContainText("46");
    await expect(first).not.toContainText("2026-10-10");
    await expect(page.locator(".page-heading time")).toHaveText(session.date);
    const height = await rows
      .first()
      .evaluate((row) => row.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(height).toBeLessThanOrEqual(80);
    await page.screenshot({
      path: test.info().outputPath(`merged-collapsed-${language}.png`),
      fullPage: true,
    });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(rows.first().locator("details")).toHaveAttribute("open", "");
    await expect(rows.first().locator(".assessment-basis")).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`merged-expanded-${language}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Space");
    await expect(rows.first().locator("details")).not.toHaveAttribute("open");
    await expect(rows.nth(6).locator(".assessment-cross")).toBeVisible();
    await expect(rows.last()).toContainText(session.results[7].label);
    const clips = await rows
      .last()
      .evaluate((row) => row.scrollWidth > row.clientWidth + 1);
    expect(clips).toBe(false);
    await expectLayout(page);
    await rows.first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`compact-assessments-${language}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await expectLayout(page);
    await page.screenshot({
      path: test.info().outputPath(`merged-320-collapsed-${language}.png`),
      fullPage: true,
    });
    await rows.last().locator("summary").click();
    await expect(rows.last().locator(".series-result-details")).toBeVisible();
    await expectLayout(page);
    await page.screenshot({
      path: test.info().outputPath(`merged-320-expanded-${language}.png`),
      fullPage: true,
    });
  });
}
