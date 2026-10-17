import type { ReactNode } from "react";
import { useI18n } from "./language-provider";
import { dateSchema, resultSchema, type Assessment } from "@/lib/models";
import { disciplineIds } from "@/lib/disciplines";
import { disciplineName, targetName } from "@/lib/i18n-domain";
import { localizeMessage, type MessageKey } from "@/lib/i18n";
import { z } from "@/lib/validation";

// Older assessments may have only part of the saved input. Read each known
// field independently; never substitute today's profile or session values.
const year = z.number().int().min(1800).max(9999);
const savedInput = z.object({
  date: dateSchema.optional().catch(undefined),
  discipline: z.enum(disciplineIds).optional().catch(undefined),
  group: z.string().trim().min(1).max(100).optional().catch(undefined),
  birthYear: year.nullish().catch(undefined),
  ageReferenceYear: year.optional().catch(undefined),
  ageBasis: z.literal("previous-calendar-year").optional().catch(undefined),
  result: resultSchema.optional().catch(undefined),
});

export function AssessmentBasis({
  assessment,
  showDate = true,
}: {
  assessment: Assessment;
  showDate?: boolean;
}) {
  const { tr, language, locale } = useI18n();
  const input = savedInput.safeParse(assessment.input).data;
  const result = input?.result;
  const number = (value: number) => value.toLocaleString(locale);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
      new Date(value + "T12:00:00Z"),
    );
  const field = (key: MessageKey, value: ReactNode) =>
    value !== undefined && value !== null && value !== "" ? (
      <div key={key}>
        <dt>{tr(key)}</dt>
        <dd>{typeof value === "number" ? number(value) : value}</dd>
      </div>
    ) : null;
  const age =
    input?.birthYear != null &&
    input.ageReferenceYear !== undefined &&
    input.ageReferenceYear >= input.birthYear &&
    input.ageBasis === "previous-calendar-year"
      ? input.ageReferenceYear - input.birthYear
      : undefined;
  return (
    <div className="assessment-basis">
      <p>{tr("basis.help")}</p>
      {(!result || !input?.date || !input.discipline || !input.group) && (
        <p className="muted">{tr("basis.unavailable")}</p>
      )}
      {input &&
        (input.date ||
          input.discipline ||
          input.group ||
          result ||
          input.birthYear != null) && (
          <>
            <h4>{tr("basis.conditions")}</h4>
            <dl>
              {showDate && field("common.date", input.date && date(input.date))}
              {field(
                "session.sport",
                input.discipline && disciplineName(language, input.discipline),
              )}
              {field("session.group", input.group)}
              {field("session.distance", result?.distance)}
              {field(
                "session.target",
                result?.target && targetName(language, result.target),
              )}
              {field("session.shootingTime", result?.seconds)}
            </dl>
            {result && (
              <>
                <h4>{tr("basis.recordedResult")}</h4>
                <dl>
                  {field("session.resultName", result.label)}
                  {field("session.shots", result.shots)}
                  {field("session.points", result.points)}
                  {field("session.penaltyPoints", result.penaltyPoints)}
                  {field("session.hits", result.hits)}
                  {field("session.figures", result.figures)}
                  {field("basis.innerTens", result.x)}
                  {field("session.elapsedSeconds", result.elapsedSeconds)}
                  {field("session.penaltyTime", result.penaltySeconds)}
                  {field("session.matchPercent", result.matchPercent)}
                  {field("session.placement", result.placement)}
                  {field("session.scoreText", result.scoreText)}
                  {field(
                    "session.resultStatus",
                    result.status && tr(`resultStatus.${result.status}`),
                  )}
                  {field(
                    "session.scoring",
                    result.scoring &&
                      tr(
                        result.scoring === "ordinary"
                          ? "session.ordinaryScoring"
                          : "session.pointsScoring",
                      ),
                  )}
                  {result.dryFire &&
                    field("session.context", tr("session.dryFire"))}
                </dl>
              </>
            )}
            {input.discipline === "precision" && (
              <>
                {age !== undefined && (
                  <p>
                    <strong>
                      {tr("basis.age", {
                        age: number(age),
                        year: input.ageReferenceYear ?? "",
                      })}
                    </strong>
                    <br />
                    {tr("basis.ageHelp")}
                  </p>
                )}
                {input.birthYear === null && <p>{tr("basis.noBirth")}</p>}
              </>
            )}
          </>
        )}
      {(assessment.status === "met" || assessment.status === "not-met") &&
        assessment.reason && (
          <div className="assessment-comparison">
            <h4>
              {tr("basis.comparison", {
                level: tr(`level.${assessment.level}`),
              })}
            </h4>
            <p>{localizeMessage(language, assessment.reason)}</p>
          </div>
        )}
    </div>
  );
}
