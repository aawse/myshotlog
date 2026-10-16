import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LoginButton } from "@/components/login-button";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const { tr } = await getI18n();

  const { error } = await searchParams;
  return (
    <main className="auth">
      <Link href="/" className="brand">
        <BrandLogo />
      </Link>
      <span className="eyebrow">{tr("dashboard.eyebrow")}</span>
      <h1>{tr("login.heading")}</h1>
      <p className="muted">{tr("login.intro")}</p>
      <section className="card">
        <LoginButton />
        <p className="muted">{tr("login.help")}</p>
        {error && (
          <p role="alert" className="notice">
            {error === "access" ? tr("login.denied") : tr("login.failed")}
          </p>
        )}
      </section>
    </main>
  );
}
