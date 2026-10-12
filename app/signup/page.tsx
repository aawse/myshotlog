import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
export default async function Page() {
  const { tr } = await getI18n();

  return (
    <main className="auth">
      <h1>{tr("login.accountHeading")}</h1>
      <p>{tr("login.accountHelp")}</p>
      <Link className="button" href="/login/">
        {tr("login.returnLink")}
      </Link>
    </main>
  );
}
