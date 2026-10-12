import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
export default async function Setup() {
  const { tr } = await getI18n();

  return (
    <main className="auth">
      <div className="brand">
        <BrandLogo />
      </div>
      <h1>{tr("setup.heading")}</h1>
      <p>{tr("setup.intro")}</p>
      <section className="card">
        <h2>{tr("setup.start")}</h2>
        <ol>
          <li>{tr("setup.repository")}</li>
          <li>{tr("setup.token")}</li>
          <li>{tr("setup.oauth")}</li>
          <li>{tr("setup.variables")}</li>
        </ol>
        <p>{tr("setup.guide")}</p>
        <Link className="button" href="/login/">
          {tr("login.returnLink")}
        </Link>
      </section>
      <p className="muted">{tr("setup.history")}</p>
    </main>
  );
}
