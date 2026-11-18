import { Fragment } from "react";
import {
  firearmSchema,
  profileSchema,
  quickEntryInputSchema,
  quickEntrySchema,
  sessionSchema,
  type QuickResult,
} from "@/lib/models";
import { disciplineName, targetName } from "@/lib/i18n-domain";
import type { MessageKey } from "@/lib/i18n";
import type { Operation, Target } from "@/lib/sync/model";
import { useI18n } from "./language-provider";

const actionLabels = {
  profile: "profile.save",
  firearm: "firearm.save",
  session: "session.save",
  "session-with-quick": "quick.createSession",
  "attach-quick": "quick.linkExisting",
  "evaluate-session": "sync.evaluateSession",
  "quick-entry": "sync.saveQuick",
  "delete-session": "session.delete",
  "delete-quick-entry": "sync.deleteQuick",
} satisfies Record<Operation["action"], MessageKey>;

type Field = [MessageKey, string | number | null | undefined];

function Fields({ fields }: { fields: Field[] }) {
  const { tr } = useI18n();
  return (
    <dl className="sync-fields">
      {fields.map(([label, value]) => (
        <Fragment key={label}>
          <dt>{tr(label)}</dt>
          <dd>
            {value === "" || value == null ? tr("common.notSpecified") : value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Series({ result }: { result: QuickResult }) {
  const { tr } = useI18n();
  const fields: Field[] = [
    ["session.shots", result.shots],
    [
      "session.resultStatus",
      tr(`resultStatus.${result.status ?? "completed"}`),
    ],
    ["session.dryFire", result.dryFire ? tr("sync.yes") : undefined],
    ["photo.heading", result.photoId ? tr("sync.photoAttached") : undefined],
    ["session.points", result.points],
    ["session.hits", result.hits],
    ["session.figures", result.figures],
    ["quick.innerTens", result.x],
    ["session.elapsedSeconds", result.elapsedSeconds],
    ["session.scoreText", result.scoreText],
    ["session.penaltyPoints", result.penaltyPoints],
    ["session.penaltyTime", result.penaltySeconds],
    ["session.placement", result.placement],
    ["session.matchPercent", result.matchPercent],
    [
      "session.stageDistance",
      result.stageDistance == null
        ? undefined
        : result.stageDistance + " " + (result.stageDistanceUnit ?? "m"),
    ],
    ["session.stageTimeLimit", result.stageTimeLimit],
    ["session.target", result.stageTarget ?? result.target],
  ];
  return (
    <div className="sync-series">
      <strong>{result.label || tr("common.seriesLabel")}</strong>
      <Fields
        fields={fields.filter(([, value]) => value != null && value !== "")}
      />
    </div>
  );
}

function RecordDetails({
  kind,
  value,
}: {
  kind: Target["kind"];
  value: unknown;
}) {
  const { language, tr } = useI18n();
  if (value == null) return <p>{tr("sync.noRecord")}</p>;
  if (kind === "profile") {
    const parsed = profileSchema.safeParse(value);
    if (parsed.success) {
      const profile = parsed.data;
      return (
        <Fields
          fields={[
            ["profile.displayName", profile.displayName],
            ["profile.birthDate", profile.birthDate ?? profile.birthYear],
            [
              "profile.language",
              tr(
                profile.language === "sv"
                  ? "profile.swedish"
                  : "profile.english",
              ),
            ],
            ["profile.timezone", profile.timezone],
          ]}
        />
      );
    }
  } else if (kind === "firearm") {
    const parsed = firearmSchema.safeParse(value);
    if (parsed.success) {
      const f = parsed.data;
      return (
        <Fields
          fields={[
            ["firearm.nickname", f.nickname],
            ["firearm.make", f.make],
            ["firearm.model", f.model],
            ["firearm.caliber", f.caliber],
            ["firearm.group", f.group],
            ["firearm.serial", f.serial],
            [
              "sync.firearmState",
              tr(f.archived ? "firearm.archived" : "firearm.active"),
            ],
            [
              "firearm.defaultSport",
              f.defaultDiscipline
                ? disciplineName(language, f.defaultDiscipline)
                : undefined,
            ],
            [
              "firearm.type",
              f.firearmType ? tr(`firearm.type.${f.firearmType}`) : undefined,
            ],
            ["firearm.hasOptic", f.hasOptic ? tr("sync.yes") : tr("sync.no")],
            ["common.notes", f.notes],
          ]}
        />
      );
    }
  } else if (kind === "session") {
    const parsed = sessionSchema.safeParse(value);
    if (parsed.success) {
      const s = parsed.data;
      return (
        <>
          <Fields
            fields={[
              ["common.date", s.date],
              ["session.startTime", s.time],
              ["session.location", s.location],
              ["session.sport", disciplineName(language, s.discipline)],
              ["session.program", s.program],
              [
                "session.context",
                tr(
                  s.context === "competition"
                    ? "session.competition"
                    : "session.practice",
                ),
              ],
              [
                "session.firearm",
                s.firearmSnapshot
                  ? s.firearmSnapshot.make + " " + s.firearmSnapshot.model
                  : s.firearmId
                    ? undefined
                    : tr("common.borrowedFirearm"),
              ],
              ["session.group", s.group],
              ["session.distance", s.distance],
              ["session.target", targetName(language, s.target)],
              ["session.shootingTime", s.seconds],
              ["session.ruleReference", s.ruleReference],
              ["common.notes", s.notes],
            ]}
          />
          <details>
            <summary>
              {tr("common.seriesCount", { count: s.results.length })}
            </summary>
            {s.results.map((result) => (
              <Series key={result.id} result={result} />
            ))}
          </details>
        </>
      );
    }
  } else {
    const parsed = quickEntryInputSchema.or(quickEntrySchema).safeParse(value);
    if (parsed.success) {
      const q = parsed.data;
      return (
        <>
          <Fields
            fields={[
              ["common.date", q.date],
              ["session.sport", disciplineName(language, q.discipline)],
              ["common.notes", q.notes],
            ]}
          />
          <Series result={q.result} />
        </>
      );
    }
  }
  return <p>{tr("sync.previewUnavailable")}</p>;
}

export function SyncComparison({
  operation,
  current,
}: {
  operation: Operation;
  current: Target[];
}) {
  const { tr } = useI18n();
  const [target] = operation.base;
  const action = operation.action;
  const existingOnly =
    action === "attach-quick" ||
    action === "evaluate-session" ||
    action === "delete-session" ||
    action === "delete-quick-entry";
  const local = existingOnly
    ? target.value
    : action === "session-with-quick" &&
        operation.payload &&
        typeof operation.payload === "object" &&
        "session" in operation.payload
      ? operation.payload.session
      : operation.payload;
  return (
    <>
      <p>
        <strong>{tr(actionLabels[action])}</strong>
      </p>
      <details>
        <summary>{tr("sync.compare")}</summary>
        <div className="sync-comparison">
          <div>
            <h3>{tr("sync.deviceVersion")}</h3>
            {existingOnly && <p>{tr("sync.beforeChange")}</p>}
            <RecordDetails kind={target.kind} value={local} />
            {operation.base.slice(1).map((entry) => (
              <RecordDetails
                key={entry.id}
                kind={entry.kind}
                value={entry.value}
              />
            ))}
          </div>
          <div>
            <h3>{tr("sync.serverVersion")}</h3>
            {current.length ? (
              current.map((entry) => (
                <RecordDetails
                  key={entry.id ?? entry.kind}
                  kind={entry.kind}
                  value={entry.value}
                />
              ))
            ) : (
              <p>{tr("sync.previewUnavailable")}</p>
            )}
          </div>
        </div>
      </details>
    </>
  );
}
