import { records } from "@/lib/data";
import { todayInTimezone } from "@/lib/models";
import { QuickSeries } from "@/components/quick-series";
export default async function Page() {
  const data = await records();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PÅ BANAN</span>
          <h1>Snabbregistrera serie</h1>
          <p>Spara nu. Samla serierna i ett pass senare.</p>
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
