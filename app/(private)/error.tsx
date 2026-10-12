"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="card">
      <h1>Journalen kunde inte laddas</h1>
      <p>
        Kontrollera anslutningen och att serverns Git-repository och branch är
        korrekt konfigurerade.
      </p>
      <button onClick={reset}>Försök igen</button>
    </section>
  );
}
