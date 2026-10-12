import { t, messages, type Language, type MessageKey } from "./i18n";
import { z } from "./validation";
import caliberData from "./data/calibers.json";
import targetData from "./data/targets.json";
const optionSchema = z
  .array(
    z
      .object({
        value: z.string().trim().min(1).max(60),
        labelKey: z
          .enum(Object.keys(messages.sv) as [MessageKey, ...MessageKey[]])
          .refine(
            (key) => Object.hasOwn(messages.en, key),
            "Missing English option label",
          ),
      })
      .strict(),
  )
  .min(1)
  .refine(
    (items) => new Set(items.map((i) => i.value)).size === items.length,
    "Duplicate option values",
  );
export const calibers = optionSchema.parse(caliberData);
export const targets = optionSchema.parse(targetData);
function optionLabel(
  options: { value: string; labelKey: MessageKey }[],
  value: string | null | undefined,
  language: Language,
) {
  const option = options.find((option) => option.value === value);
  return option
    ? t(language, option.labelKey)
    : value || t(language, "common.notSpecified");
}
export function targetLabel(
  value: string | null | undefined,
  language: Language = "sv",
) {
  return optionLabel(targets, value, language);
}
export function caliberLabel(
  value: string | null | undefined,
  language: Language = "sv",
) {
  return optionLabel(calibers, value, language);
}
