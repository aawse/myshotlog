import Link from "next/link";
export default function Page() {
  return (
    <main className="auth">
      <h1>Använd ditt GitHub-konto.</h1>
      <p>Kontakta instansägaren för att få åtkomst till journalen.</p>
      <Link className="button" href="/login">
        Till inloggning →
      </Link>
    </main>
  );
}
