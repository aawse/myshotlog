import { getI18n } from "@/lib/i18n-server";
import { notFound } from "next/navigation";
import { records } from "@/lib/data";
import { SessionForm } from "@/components/session-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    quick?: string;
  }>;
}) {
  const { tr } = await getI18n();

  const data = await records();
  const { quick } = await searchParams;
  const ids = quick?.split(",") ?? [];
  const selected = ids.map((id) => data.quickEntries?.find((q) => q.id === id));
  if (
    quick &&
    (!ids.length ||
      new Set(ids).size !== ids.length ||
      selected.some((q) => !q) ||
      selected.some(
        (q) =>
          q!.date !== selected[0]!.date ||
          q!.discipline !== selected[0]!.discipline,
      ))
  )
    notFound();
  const quickEntries = selected.flatMap((q) =>
    q
      ? [
          {
            id: q.id,
            date: q.date,
            discipline: q.discipline,
            result: q.result,
            notes: q.notes,
          },
        ]
      : [],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("quick.atRange")}</span>
          <h1>{tr("session.newHeading")}</h1>
          <p>{tr("session.newHelp")}</p>
        </div>
      </div>
      <SessionForm
        firearms={data.firearms}
        quickEntries={quickEntries}
        locations={data.sessions.map((s) => s.location)}
        timezone={data.profile.timezone}
      />
    </>
  );
}
