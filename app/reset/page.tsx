import Link from "next/link";
export default function Page() {
  return (
    <main className="auth">
      <h1>Ditt lösenord hanteras av GitHub.</h1>
      <p>Återställ ditt GitHub-lösenord på GitHub och logga sedan in igen.</p>
      <a className="button" href="https://github.com/password_reset">
        Till GitHub →
      </a>
      <p>
        <Link href="/login">Till inloggning</Link>
      </p>
    </main>
  );
}
