import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
import { LanguageProvider } from "../components/language-provider";
import { SettingsForm } from "../components/settings-form";
import { profile } from "./fixtures";
import { disciplineName, targetName } from "../lib/i18n-domain";
it("renders an English profile form without translating user-entered text", () => {
  const html = renderToStaticMarkup(
    <LanguageProvider language="en">
      <SettingsForm
        profile={{ ...profile, language: "en", displayName: "Översikt" }}
      />
    </LanguageProvider>,
  );
  expect(html).toContain("Your profile");
  expect(html).toContain("Language");
  expect(html).toContain("Save profile");
  expect(html).toContain('value="Översikt"');
  expect(html).not.toContain("kommer senare");
});
it("translates only built-in discipline/target labels and preserves custom target values", () => {
  expect(disciplineName("en", "precision")).toBe("Precision shooting");
  expect(targetName("en", "precision25")).toBe("25 m precision pistol target");
  expect(targetName("en", "Min egen tavla")).toBe("Min egen tavla");
});
it("preserves firearm names and notes that look like translation source strings", async () => {
  const { FirearmForm } = await import("../components/firearm-form");
  const { firearm } = await import("./fixtures");
  const html = renderToStaticMarkup(
    <LanguageProvider language="en">
      <FirearmForm
        initial={{
          ...firearm,
          nickname: "Översikt",
          notes: "Spara profil",
          make: "Mina vapen",
        }}
      />
    </LanguageProvider>,
  );
  expect(html).toContain("Manufacturer");
  expect(html).toContain("Save firearm");
  expect(html).toContain('value="Översikt"');
  expect(html).toContain('value="Mina vapen"');
  expect(html).toContain("Spara profil</textarea>");
});

it("translates new form defaults and built-in caliber captions without changing stored fields", async () => {
  const { SessionForm } = await import("../components/session-form");
  const { caliberName } = await import("../lib/i18n-domain");
  const { changeDiscipline } = await import("../lib/session-setup");
  const { session } = await import("./fixtures");
  const html = renderToStaticMarkup(
    <LanguageProvider language="en">
      <SessionForm firearms={[]} />
    </LanguageProvider>,
  );
  expect(html).toContain('value="25 m precision · practice"');
  expect(html).toContain('value="Series 1 · 25 m"');
  expect(caliberName("en", "4.5 mm")).toBe("4.5 mm (.177, air pistol)");
  expect(
    changeDiscipline({ ...session, program: "5-shot series" }, "field", "en")
      .program,
  ).toBe("Field shooting");
  expect(
    changeDiscipline({ ...session, program: "Översikt" }, "field", "en")
      .program,
  ).toBe("Översikt");
});

it("has localized labels for every built-in caliber and target and renders them in both languages", async () => {
  const { calibers, targets } = await import("../lib/options");
  const { messages } = await import("../lib/i18n");
  const { caliberName } = await import("../lib/i18n-domain");
  const { FirearmForm } = await import("../components/firearm-form");
  const { SessionForm } = await import("../components/session-form");
  const escape = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#x27;");
  for (const language of ["sv", "en"] as const) {
    const firearms = renderToStaticMarkup(
      <LanguageProvider language={language}>
        <FirearmForm />
      </LanguageProvider>,
    );
    const sessions = renderToStaticMarkup(
      <LanguageProvider language={language}>
        <SessionForm firearms={[]} />
      </LanguageProvider>,
    );
    for (const option of calibers) {
      expect(messages[language][option.labelKey]).toBeTruthy();
      expect(caliberName(language, option.value)).toBe(
        messages[language][option.labelKey],
      );
      expect(firearms).toContain(`value="${escape(option.value)}"`);
      expect(firearms).toContain(
        `>${escape(messages[language][option.labelKey])}</option>`,
      );
    }
    for (const option of targets) {
      expect(messages[language][option.labelKey]).toBeTruthy();
      expect(targetName(language, option.value)).toBe(
        messages[language][option.labelKey],
      );
      expect(sessions).toContain(`value="${escape(option.value)}"`);
      expect(sessions).toContain(
        `>${escape(messages[language][option.labelKey])}</option>`,
      );
    }
  }
  expect(caliberName("sv", "4.5 mm")).toBe("4,5 mm (.177, luftpistol)");
  expect(caliberName("en", "4.5 mm")).toBe("4.5 mm (.177, air pistol)");
  expect(caliberName("en", "Översikt")).toBe("Översikt");
  expect(targetName("en", "Spara profil")).toBe("Spara profil");
});

it("localizes new JSON option IDs using labelKey without hard-coded mappings", async () => {
  const { calibers, targets } = await import("../lib/options");
  const { caliberName } = await import("../lib/i18n-domain");
  calibers.push({ value: "new-air-caliber", labelKey: "caliber.air" });
  targets.push({ value: "new-field-target", labelKey: "target.field" });
  try {
    expect(caliberName("en", "new-air-caliber")).toBe(
      "4.5 mm (.177, air pistol)",
    );
    expect(targetName("en", "new-field-target")).toBe("Field shooting target");
  } finally {
    calibers.pop();
    targets.pop();
  }
});
