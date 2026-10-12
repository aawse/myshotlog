import React from "react";
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
  expect(html).toContain('value="5-shot series"');
  expect(html).toContain('value="Series 1"');
  expect(
    caliberName("en", { value: "4.5 mm", label: "4,5 mm (.177, luftpistol)" }),
  ).toBe("4.5 mm (.177, air pistol)");
  expect(
    changeDiscipline({ ...session, program: "5-shot series" }, "field", "en")
      .program,
  ).toBe("Field shooting");
  expect(
    changeDiscipline({ ...session, program: "Översikt" }, "field", "en")
      .program,
  ).toBe("Översikt");
});
