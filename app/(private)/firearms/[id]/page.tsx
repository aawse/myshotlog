import { notFound } from "next/navigation";
import { records } from "@/lib/data";
import { FirearmForm } from "@/components/firearm-form";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await records();
  const f = data.firearms.find((f) => f.id === id);
  if (!f) notFound();
  return (
    <>
      <h1>Vapenuppgifter</h1>
      <FirearmForm initial={f} />
    </>
  );
}
