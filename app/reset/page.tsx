import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
export default async function Page() {
  const { tr } = await getI18n();

  return (
    <main className="auth">
      <h1>{tr("login.passwordHeading")}</h1>
      <p>{tr("login.passwordHelp")}</p>
      <a className="button" href="https://github.com/password_reset">
        {tr("login.visitGithub")}
      </a>
      <p>
        <Link href="/login">{tr("login.return")}</Link>
      </p>
    </main>
  );
}
