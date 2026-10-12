import { getI18n } from "@/lib/i18n-server";
import { FirearmForm } from "@/components/firearm-form";
export default async function Page() {
  const { tr } = await getI18n();

  return (
    <>
      <h1>{tr("firearm.add")}</h1>
      <FirearmForm />
    </>
  );
}
