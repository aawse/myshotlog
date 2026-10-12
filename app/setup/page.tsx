import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
export default function Setup() {
  return (
    <main className="auth">
      <div className="brand">
        <BrandLogo />
      </div>
      <h1>Din egen skyttejournal.</h1>
      <p>En privat Git-journal med en commit per sparad post.</p>
      <section className="card">
        <h2>Kom igång</h2>
        <ol>
          <li>Välj ett privat Git-repository och en databranch.</li>
          <li>
            Konfigurera repository och serverns åtkomsttoken i .env.local.
          </li>
          <li>
            Registrera en GitHub OAuth-app med callback /auth/github/callback.
          </li>
          <li>
            Ange klient-ID, klienthemlighet, tillåtna GitHub-ID:n och
            sessionshemlighet. Starta om appen.
          </li>
        </ol>
        <p>Se README.md och docs/SETUP.md för hela guiden.</p>
        <Link className="button" href="/login">
          Till inloggning →
        </Link>
      </section>
      <p className="muted">
        Git-historiken bevarar tidigare versioner även efter borttagning från
        journalen.
      </p>
    </main>
  );
}
