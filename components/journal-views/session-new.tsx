"use client";
import { useI18n } from "@/components/language-provider";
import { JournalMissing } from "../journal-missing";
import { useRecords } from "@/components/journal-provider";
import { SessionForm } from "@/components/session-form";
export default function View({ quick }: { quick?: string }) {
  const { tr } = useI18n();

  const data = useRecords();
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
    return <JournalMissing />;
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
