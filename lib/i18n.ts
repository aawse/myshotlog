import sv from "./locales/sv.json";
import en from "./locales/en.json";
const catalog = { sv, en };
export type Language = "sv" | "en";
export type MessageKey = keyof typeof catalog.sv;
export const messages = catalog;
export function languageOrDefault(value: unknown): Language {
  return value === "en" ? "en" : "sv";
}
export function localeFor(language: Language) {
  return language === "en" ? "en-GB" : "sv-SE";
}
export function t(
  language: Language,
  key: MessageKey,
  values: Record<string, string | number> = {},
) {
  const message = catalog[language][key] ?? catalog.sv[key];
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
export function translator(value: unknown) {
  const language = languageOrDefault(value);
  return {
    language,
    locale: localeFor(language),
    tr: (key: MessageKey, values?: Record<string, string | number>) =>
      t(language, key, values),
  };
}

// Used for canonical built-in values in records; never to translate user-entered text.
export function swText(key: MessageKey) {
  return messages.sv[key];
}

// Only for app-generated messages (errors, status and assessment explanations).
// Never call this for user-entered names, notes, locations, programs or labels.
const messagePatterns = (Object.keys(messages.sv) as MessageKey[]).flatMap(
  (key) =>
    (["sv", "en"] as const).map((language) => {
      const source = messages[language][key],
        names: string[] = [];
      const pattern = source
        .split(/(\{\w+\})/g)
        .map((part) => {
          if (/^\{\w+\}$/.test(part)) {
            names.push(part.slice(1, -1));
            return "([\\s\\S]*?)";
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      return { key, source, names, regex: new RegExp("^" + pattern + "$") };
    }),
);
export function localizeMessage(language: Language, value: string) {
  const exact = messagePatterns.find((pattern) => pattern.source === value);
  if (exact) return t(language, exact.key);
  for (const pattern of messagePatterns) {
    if (!pattern.names.length) continue;
    const match = value.match(pattern.regex);
    if (match)
      return t(
        language,
        pattern.key,
        Object.fromEntries(
          pattern.names.map((name, i) => [name, match[i + 1]]),
        ),
      );
  }
  return value;
}
