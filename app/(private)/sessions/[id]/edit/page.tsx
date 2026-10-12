import { notFound } from "next/navigation";
import { records } from "@/lib/data";
import { SessionForm } from "@/components/session-form";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await records();
  const s = data.sessions.find((s) => s.id === id);
  if (!s) notFound();
  return (
    <>
      <h1>Redigera pass</h1>
      <p className="muted">
        En ny revision och nya bedömningar sparas. Tidigare bedömningar bevaras.
      </p>
      <SessionForm
        firearms={data.firearms}
        initial={s}
        locations={data.sessions.map((s) => s.location)}
      />
    </>
  );
}
