import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Github } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth">
      <Link href="/" className="brand">
        <BrandLogo />
      </Link>
      <span className="eyebrow">DIN TRÄNING, SAMLAD</span>
      <h1>Välkommen tillbaka.</h1>
      <p className="muted">En privat journal för varje pass på banan.</p>
      <section className="card">
        <a className="button" href="/auth/github">
          <Github size={18} /> Logga in med GitHub →
        </a>
        <p className="muted">
          Använd ditt GitHub-konto. Instansägaren bestämmer vilka konton som har
          åtkomst.
        </p>
        {error && (
          <p role="alert" className="notice">
            {error === "access"
              ? "Ditt GitHub-konto har inte åtkomst. Kontakta instansägaren."
              : "GitHub-inloggningen kunde inte genomföras. Försök igen."}
          </p>
        )}
      </section>
    </main>
  );
}
