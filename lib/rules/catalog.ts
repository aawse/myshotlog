import { z } from "../validation";
import { dateSchema } from "../models";
import data from "./versions.json";
const thresholds = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
const groups = z
  .object({ A: thresholds, B: thresholds, C: thresholds })
  .strict();
const versionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    from: dateSchema,
    until: dateSchema,
    source: z.url().startsWith("https://"),
    edition: z.string().min(1),
    reference: z.string().min(1),
    precision: groups,
    application: thresholds,
    applicationSeconds: groups,
    ageBasis: z.literal("previous-calendar-year"),
    requiredCount: z.literal(3),
  })
  .strict();
export type RuleVersion = z.infer<typeof versionSchema>;
export const catalogSchema = z
  .array(versionSchema)
  .min(1)
  .superRefine((versions, ctx) => {
    const ids = new Set<string>();
    for (const [index, v] of versions.entries()) {
      if (ids.has(v.id))
        ctx.addIssue({
          code: "custom",
          message: "Regel-ID måste vara unika",
          path: [index, "id"],
        });
      ids.add(v.id);
      if (v.from >= v.until)
        ctx.addIssue({
          code: "custom",
          message: "Giltighetsperioden är ogiltig",
          path: [index, "until"],
        });
      if (
        versions.some(
          (other, j) =>
            j !== index && v.from < other.until && other.from < v.until,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Regelperioder får inte överlappa",
          path: [index],
        });
      if (
        Object.values(v.precision).some((t) => t.some((n) => n > 50)) ||
        v.application.some((n) => n > 6)
      )
        ctx.addIssue({
          code: "custom",
          message: "Tröskeln överstiger provets maximala resultat",
          path: [index],
        });
    }
  });
// Fail closed if edited rule data is invalid. No rule downloading at runtime.
export const rules: readonly RuleVersion[] = catalogSchema.parse(data);
export const levels = ["bronze", "silver", "gold"] as const;
export const levelLabels = { bronze: "Brons", silver: "Silver", gold: "Guld" };
