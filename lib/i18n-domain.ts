import { messages, t, type Language, type MessageKey } from "./i18n";
import { discipline, type DisciplineId } from "./disciplines";
import { targetLabel } from "./options";
export function disciplineName(language: Language, id: DisciplineId) {
  return t(language, `discipline.${id}`);
}
export function targetName(
  language: Language,
  value: string | null | undefined,
) {
  const key = `target.${value}`;
  return Object.hasOwn(messages.sv, key)
    ? t(language, key as MessageKey)
    : value
      ? targetLabel(value)
      : t(language, "common.notSpecified");
}
export function sourceSection(language: Language, id: DisciplineId) {
  return id === "sra"
    ? t(language, "domain.separateRules")
    : id === "application"
      ? t(language, "domain.appendix")
      : discipline(id).section;
}

export function caliberName(
  language: Language,
  option: { value: string; label: string },
) {
  const key = (
    {
      "4.5 mm": "caliber.air",
      ".380 ACP": "caliber.short",
      ".32 ACP": "caliber.browning",
    } as Record<string, MessageKey>
  )[option.value];
  return key ? t(language, key) : option.label;
}
