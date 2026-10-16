import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "@typescript/typescript6";
import { it, expect } from "vitest";
import { languageOrDefault, messages, t, translator } from "../lib/i18n";
import { profileSchema } from "../lib/models";
import { profile } from "./fixtures";
it("defaults an absent language to Swedish and accepts both supported languages", () => {
  expect(languageOrDefault(undefined)).toBe("sv");
  expect(languageOrDefault(null)).toBe("sv");
  expect(languageOrDefault("fr")).toBe("sv");
  expect(languageOrDefault("en")).toBe("en");
  const { language: _language, ...withoutLanguage } = profile;
  expect(profileSchema.parse(withoutLanguage).language).toBe("sv");
});
it("has identical keys and placeholders in both JSON catalogs", () => {
  expect(Object.keys(messages.en).sort()).toEqual(
    Object.keys(messages.sv).sort(),
  );
  for (const key of Object.keys(messages.sv) as (keyof typeof messages.sv)[]) {
    expect(
      [...messages.en[key].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
    ).toEqual(
      [...messages.sv[key].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
    );
  }
});
it("selects translated text and locale without interpreting user-entered text", () => {
  expect(t("sv", "nav.dashboard")).toBe("Översikt");
  expect(t("en", "nav.dashboard")).toBe("Dashboard");
  expect(translator("en").locale).toBe("en-GB");
});
it("localizes generated assessment messages without translating interpolated content", async () => {
  const { localizeMessage } = await import("../lib/i18n");
  expect(localizeMessage("en", "45 av minst 46 poäng.")).toBe(
    "45 out of at least 46 points.",
  );
  expect(localizeMessage("en", "6/6 träffar, 14/15 sekunder.")).toBe(
    "6/6 hits, 14/15 seconds.",
  );
  expect(
    t("en", "sessions.view", {
      p0: "Översikt",
      p1: "2026-10-12",
      p2: ", Spara profil",
    }),
  ).toBe("View Översikt, 2026-10-12, Spara profil");
});

it("has no duplicated translations, including casing-only variants", () => {
  for (const catalog of [messages.sv, messages.en]) {
    const values = Object.values(catalog).map((value) =>
      value.trim().toLocaleLowerCase(),
    );
    expect(new Set(values).size).toBe(values.length);
  }
});

it("has no duplicate JSON keys and keeps fixed JSX captions in the catalogs", () => {
  for (const language of ["sv", "en"]) {
    const source = ts.parseJsonText(
      `${language}.json`,
      readFileSync(`lib/locales/${language}.json`, "utf8"),
    );
    const keys: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name))
        keys.push(node.name.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(new Set(keys).size).toBe(keys.length);
  }
  const untranslated: string[] = [];
  for (const root of ["app", "components"]) {
    for (const file of readdirSync(root, { recursive: true }).filter(
      (file) => typeof file === "string" && file.endsWith(".tsx"),
    ) as string[]) {
      const path = join(root, file),
        source = ts.createSourceFile(
          path,
          readFileSync(path, "utf8"),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
      function visit(node: ts.Node) {
        if (ts.isJsxText(node) && /[\p{L}]/u.test(node.text.trim()))
          untranslated.push(`${path}: ${node.text.trim()}`);
        if (
          ts.isJsxAttribute(node) &&
          ["alt", "title", "placeholder", "aria-label"].includes(
            node.name.getText(source),
          ) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer) &&
          /[\p{L}]/u.test(node.initializer.text)
        )
          untranslated.push(`${path}: ${node.getText(source)}`);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  expect(untranslated).toEqual([]);
});
