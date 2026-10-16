import type { Session } from "../models";
import type { sessionSeriesRatings } from "../session-medals";
import { rules, type RuleVersion } from "./catalog";
type RuleGroup = {
  id: string;
  edition?: string;
  reference?: string;
  declared: boolean;
  series: string[];
};
function recordedEdition(input: unknown, id: string) {
  if (!input || typeof input !== "object" || !("ruleSnapshot" in input)) return;
  const snapshot = input.ruleSnapshot;
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !("id" in snapshot) ||
    snapshot.id !== id ||
    !("edition" in snapshot) ||
    typeof snapshot.edition !== "string" ||
    !snapshot.edition.trim()
  )
    return;
  return {
    edition: snapshot.edition,
    reference:
      "reference" in snapshot && typeof snapshot.reference === "string"
        ? snapshot.reference
        : undefined,
  };
}
// Resolve the versions used by the displayed conclusions, never by today's date.
export function appliedRuleGroups(
  session: Session,
  ratings: ReturnType<typeof sessionSeriesRatings>,
  catalog: readonly RuleVersion[] = rules,
): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const { result, assessments } of ratings) {
    const seen = new Set<string>();
    for (const assessment of assessments) {
      if (seen.has(assessment.ruleVersion)) continue;
      seen.add(assessment.ruleVersion);
      const existing = groups.get(assessment.ruleVersion);
      if (existing) {
        existing.series.push(result.label);
        continue;
      }
      const declared =
        assessment.ruleVersion === "manual" ||
        Boolean(
          session.ruleReference &&
          assessment.ruleVersion === session.ruleReference,
        );
      const metadata =
        recordedEdition(assessment.input, assessment.ruleVersion) ??
        catalog.find((version) => version.id === assessment.ruleVersion);
      groups.set(assessment.ruleVersion, {
        id: assessment.ruleVersion,
        edition: declared
          ? session.ruleReference || undefined
          : metadata?.edition,
        reference: declared ? undefined : metadata?.reference,
        declared,
        series: [result.label],
      });
    }
  }
  return [...groups.values()];
}
