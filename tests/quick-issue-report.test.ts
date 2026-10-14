import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { QuickIssueReport } from "../components/quick-issue-report";
import { LanguageProvider } from "../components/language-provider";
import { t } from "../lib/i18n";
it.each(["sv", "en"] as const)(
  "renders a compact accessible %s trigger without loading the dialog",
  (language) => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        language,
        children: createElement(QuickIssueReport),
      }),
    );
    expect(html).toContain('aria-label="' + t(language, "issues.report") + '"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('class="issue-quick-button"');
    expect(html).not.toMatch(/<dialog|<textarea|<form|<section/);
  },
);
