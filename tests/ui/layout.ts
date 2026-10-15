import { expect, type Page } from "@playwright/test";
export async function expectLayout(page: Page) {
  await expect(page.locator("h1").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
export async function expectMobileMetadata(page: Page) {
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).toContain("viewport-fit=cover");
  expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1(?:,|$)/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    /manifest.webmanifest/,
  );
  await expect(
    page.locator('meta[name="mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute("content", "MyShotLog");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  if (!href) throw new Error("Missing manifest link");
  const manifestURL = new URL(href, page.url());
  expect(manifestURL.origin).toBe(new URL(page.url()).origin);
  const response = await page.request.get(manifestURL.href);
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as {
    display: string;
    theme_color: string;
    background_color: string;
    icons: { src: string }[];
  };
  expect(data.display).toBe("standalone");
  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      green: style.getPropertyValue("--green").trim(),
      bg: style.getPropertyValue("--bg").trim(),
    };
  });
  expect(data.theme_color).toBe(palette.green);
  expect(data.background_color).toBe(palette.bg);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    palette.green,
  );
  expect(data.icons).toHaveLength(2);
  for (const icon of data.icons) {
    const url = new URL(icon.src, page.url());
    expect(url.origin).toBe(new URL(page.url()).origin);
    expect((await page.request.get(url.href)).ok()).toBe(true);
  }
}
export async function expectReadableInput(
  page: Page,
  selector: string,
  mobile: boolean,
) {
  if (!mobile) return;
  const size = await page
    .locator(selector)
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
}
