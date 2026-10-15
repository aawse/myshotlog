"use client";
import { useI18n } from "@/components/language-provider";
import { useRecords } from "@/components/journal-provider";
import { todayInTimezone } from "@/lib/models";
import { QuickSeries } from "@/components/quick-series";
export default function View() {
  const { tr } = useI18n();

  const data = useRecords();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("quick.atRange")}</span>
          <h1>{tr("quick.heading")}</h1>
          <p>{tr("quick.intro")}</p>
        </div>
      </div>
      <QuickSeries
        today={todayInTimezone(data.profile.timezone)}
        entries={(data.quickEntries ?? []).map(
          ({ id, date, discipline, result, notes, recordedAt, presetId }) => ({
            id,
            date,
            discipline,
            result,
            notes,
            recordedAt,
            presetId,
          }),
        )}
        sessions={data.sessions.map(
          ({ id, date, discipline, location, revision, presetId }) => ({
            id,
            date,
            discipline,
            location,
            revision,
            presetId,
          }),
        )}
      />
    </>
  );
}
