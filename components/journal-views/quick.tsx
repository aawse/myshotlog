"use client";
import { useI18n } from "@/components/language-provider";
import { useRecords } from "@/components/journal-provider";
import { todayInTimezone } from "@/lib/models";
import Link from "next/link";
import { RedesignIcon } from "@/components/redesign-icon";
import { QuickSeries } from "@/components/quick-series";
export default function View() {
  const { tr } = useI18n();

  const data = useRecords();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="journal-view-title">
            <Link
              className="button secondary"
              href="/dashboard/"
              aria-label={tr("common.back")}
            >
              <RedesignIcon name="back" />
            </Link>
            <span>{tr("nav.quick")}</span>
          </div>
          <h1>{tr("quick.redesignHeading")}</h1>
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
