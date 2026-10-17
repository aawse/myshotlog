import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginButton } from "../components/login-button";
import { LanguageProvider } from "../components/language-provider";
import { t } from "../lib/i18n";

it.each(["sv", "en"] as const)(
  "uses a non-submitting login button with accessible localized controls (%s)",
  (language) => {
    const html = renderToStaticMarkup(
      <LanguageProvider language={language}>
        <LoginButton />
      </LanguageProvider>,
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("action=");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain(t(language, "login.github"));
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("loading-spinner");
  },
);
