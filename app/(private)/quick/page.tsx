import { getI18n } from "@/lib/i18n-server";
import { records } from "@/lib/data";
import { todayInTimezone } from "@/lib/models";
import { QuickSeries } from "@/components/quick-series";
export default async function Page() {
  const { tr } = await getI18n();

  const data = await records();
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
          ({ id, date, discipline, result, notes, recordedAt }) => ({
            id,
            date,
            discipline,
            result,
            notes,
            recordedAt,
          }),
        )}
        sessions={data.sessions.map(
          ({ id, date, discipline, location, revision }) => ({
            id,
            date,
            discipline,
            location,
            revision,
          }),
        )}
      />
    </>
  );
}
