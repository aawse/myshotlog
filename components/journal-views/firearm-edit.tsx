"use client";
import { useI18n } from "@/components/language-provider";
import { JournalMissing } from "../journal-missing";
import { useRecords } from "@/components/journal-provider";
import { FirearmForm } from "@/components/firearm-form";
export default function View({ id }: { id: string }) {
  const { tr } = useI18n();

  const data = useRecords();
  const f = data.firearms.find((f) => f.id === id);
  if (!f) return <JournalMissing />;
  return (
    <>
      <h1>{tr("firearm.details")}</h1>
      <FirearmForm key={f.id} initial={f} />
    </>
  );
}
