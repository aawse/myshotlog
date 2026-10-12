import { t, type Language } from "./i18n";
import { discipline, type DisciplineId } from "./disciplines";
import { targetLabel, caliberLabel } from "./options";
export function disciplineName(language: Language, id: DisciplineId) {
  return t(language, `discipline.${id}`);
}
export function targetName(
  language: Language,
  value: string | null | undefined,
) {
  return targetLabel(value, language);
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
  value: string | null | undefined,
) {
  return caliberLabel(value, language);
}
