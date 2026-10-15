import { readFile } from "node:fs/promises";
import { test, expect } from "./fixture";
import { expectLayout } from "./layout";
import { reviewSession } from "../../lib/witness/model";
import { session } from "../fixtures";
import en from "../../lib/locales/en.json";

test("anonymous witness photo, drawing and signing work without login", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  const image = await readFile("public/brand/MyShotLog-app-192.png");
  let signed = false;
  await context.route("**/api/witness/**", async (route) => {
    const body = route.request().postDataJSON() as {
      action: string;
      name?: string;
      signature?: { data?: string };
    };
    if (body.action === "sign") {
      expect(body.name).toBe("Fixture witness");
      expect(body.signature?.data?.length).toBeGreaterThan(50);
      signed = true;
      await route.fulfill({ json: { id: session.id } });
    } else
      await route.fulfill({
        json: {
          snapshot: reviewSession(session, session.results[0].id),
          photo: {
            mediaType: "image/png",
            width: 192,
            height: 192,
            data: image.toString("base64"),
          },
        },
      });
  });
  await page.goto("/witness/#token=fictional-invitation&lang=en");
  await expect(page.locator("form.witness-form")).toBeVisible();
  await page.locator(".photo-thumbnail").click();
  await expect(page.locator(".photo-full:not(.photo-pending)")).toBeVisible();
  await page.locator(".photo-overlay-header button").click();
  await expect(page.locator(".photo-overlay")).toBeHidden();
  await page
    .getByLabel(en["witness.name"], { exact: true })
    .fill("Fixture witness");
  const canvas = page.locator("#witness-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Missing signature canvas");
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 90, bounds.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.locator('form.witness-form input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: en["witness.submit"], exact: true })
    .click();
  await expect(
    page.getByText(en["witness.saved"], { exact: true }),
  ).toBeVisible();
  expect(signed).toBe(true);
  await expectLayout(page);
});

test("selected photos are optimized in the browser and can be removed", async ({
  page,
}) => {
  await page.goto("/quick/");
  await page
    .locator('.quick-form input[type="file"]')
    .first()
    .setInputFiles("public/brand/MyShotLog-app-192.png");
  await expect(page.locator(".target-photo-preview")).toBeVisible();
  await expect(page.locator(".target-photo-preview")).toHaveAttribute(
    "src",
    /^data:image\/jpeg;base64,/,
  );
  await page.locator(".photo-actions").getByRole("button").last().click();
  await expect(page.locator(".target-photo-preview")).toBeHidden();
  await page
    .locator('.quick-form input[type="file"]')
    .first()
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
  await expect(page.locator(".target-photo-input [role=alert]")).toBeVisible();
  await expect(page.locator(".target-photo-preview")).toBeHidden();
  await expectLayout(page);
});

test("expired witness invitations do not display a signing form", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await context.route("**/api/witness/**", (route) =>
    route.fulfill({ status: 410, json: { error: "unavailable" } }),
  );
  await page.goto("/witness/#token=expired-fixture&lang=en");
  await expect(
    page.getByText(en["witness.unavailable"], { exact: true }),
  ).toBeVisible();
  await expect(page.locator("form.witness-form")).toHaveCount(0);
});
