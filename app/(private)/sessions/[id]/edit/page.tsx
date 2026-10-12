import { getI18n } from "@/lib/i18n-server";
import { notFound } from "next/navigation";
import { records } from "@/lib/data";
import { SessionForm } from "@/components/session-form";
export default async function Page({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { tr } = await getI18n();

  const { id } = await params;
  const data = await records();
  const s = data.sessions.find((s) => s.id === id);
  if (!s) notFound();
  return (
    <>
      <h1>{tr("session.editHeading")}</h1>
      <p className="muted">{tr("session.revisionHelp")}</p>
      <SessionForm
        firearms={data.firearms}
        initial={s}
        locations={data.sessions.map((s) => s.location)}
      />
    </>
  );
}
