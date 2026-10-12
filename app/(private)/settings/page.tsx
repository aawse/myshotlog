import { records } from "@/lib/data";
import { SettingsForm } from "@/components/settings-form";
export default async function Page() {
  const data = await records();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DITT KONTO</span>
          <h1>Inställningar</h1>
          <p>Hantera profilen och ta med dig journalen.</p>
        </div>
      </div>
      <SettingsForm profile={data.profile} />
    </>
  );
}
