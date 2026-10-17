import { test, expect } from "./fixture";
test.use({
  expectedCspDirectives: ["form-action", "connect-src", "script-src"],
});
test("production CSP blocks external forms, external fetches and inline scripts", async ({
  page,
}) => {
  let externalRequests = 0;
  await page.route("https://csp-probe.invalid/**", (route) => {
    externalRequests++;
    return route.abort();
  });
  const response = await page.goto("/login/");
  expect(response?.headers()["content-security-policy"]).toContain(
    "form-action 'self'",
  );
  for (const directive of ["form-action", "connect-src", "script-src"]) {
    const blocked = page.waitForEvent("console", {
      timeout: 5000,
      predicate: (message) =>
        message.text().startsWith("MYSHOTLOG_CSP_VIOLATION:") &&
        JSON.parse(message.text().slice("MYSHOTLOG_CSP_VIOLATION:".length))
          .directive === directive,
    });
    if (directive === "script-src") {
      await page.route("**/__csp-inline-probe__/", (route) =>
        route.fulfill({
          contentType: "text/html",
          headers: {
            "Content-Security-Policy":
              response?.headers()["content-security-policy"] ?? "",
          },
          body: "<main>Inline script probe</main><script>document.documentElement.dataset.inlineExecuted = 'true'</script>",
        }),
      );
      await page.goto("/__csp-inline-probe__/");
    } else {
      await page.evaluate(async (directive) => {
        if (directive === "form-action") {
          const form = document.createElement("form");
          form.action = "https://csp-probe.invalid/form";
          document.body.append(form);
          form.requestSubmit();
        } else {
          await fetch("https://csp-probe.invalid/fetch").catch(() => undefined);
        }
      }, directive);
      expect(page.url()).toMatch(/\/login\/$/);
    }
    await blocked;
  }
  expect(externalRequests).toBe(0);
  expect(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-inline-executed"),
    ),
  ).toBe(false);
  expect(page.url()).toMatch(/\/__csp-inline-probe__\/$/);
});
