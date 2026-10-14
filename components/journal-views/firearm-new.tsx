"use client";
import { useI18n } from "@/components/language-provider";
import { FirearmForm } from "@/components/firearm-form";
export default function View() {
  const { tr } = useI18n();

  return (
    <>
      <h1>{tr("firearm.add")}</h1>
      <FirearmForm />
    </>
  );
}
