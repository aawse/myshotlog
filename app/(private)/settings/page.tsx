import { getI18n } from "@/lib/i18n-server";
import { records } from "@/lib/data";
import { SettingsForm } from "@/components/settings-form";
export default async function Page() {
  const { tr } = await getI18n();

  const data = await records();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("settings.eyebrow")}</span>
          <h1>{tr("nav.settings")}</h1>
          <p>{tr("settings.intro")}</p>
        </div>
      </div>
      <SettingsForm profile={data.profile} />
    </>
  );
}
