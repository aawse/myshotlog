import { z } from "./validation";
import caliberData from "./data/calibers.json";
import targetData from "./data/targets.json";
const optionSchema = z
  .array(
    z
      .object({
        value: z.string().trim().min(1).max(60),
        label: z.string().trim().min(1).max(120),
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
export function targetLabel(value: string | null | undefined) {
  return targets.find((t) => t.value === value)?.label ?? value ?? "Ej angiven";
}
