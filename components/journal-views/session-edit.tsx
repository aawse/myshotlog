"use client";
import { useI18n } from "@/components/language-provider";
import { JournalMissing } from "../journal-missing";
import { useRecords } from "@/components/journal-provider";
import { SessionForm } from "@/components/session-form";
export default function View({ id }: { id: string }) {
  const { tr } = useI18n();

  const data = useRecords();
  const s = data.sessions.find((s) => s.id === id);
  if (!s) return <JournalMissing />;
  return (
    <>
      <h1>{tr("session.editHeading")}</h1>
      <p className="muted">{tr("session.revisionHelp")}</p>
      <SessionForm
        key={s.id}
        firearms={data.firearms}
        initial={s}
        locations={data.sessions.map((s) => s.location)}
      />
    </>
  );
}
