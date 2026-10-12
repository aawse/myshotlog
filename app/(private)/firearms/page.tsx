import Link from "next/link";
import { Target } from "lucide-react";
import { discipline } from "@/lib/disciplines";
import { records } from "@/lib/data";
export default async function Page() {
  const data = await records();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DIN UTRUSTNING</span>
          <h1>Mina vapen</h1>
          <p>
            Privata uppgifter. Historiken följer med när ett vapen arkiveras.
          </p>
        </div>
        <Link className="button" href="/firearms/new">
          + Lägg till vapen
        </Link>
      </div>
      <div className="firearm-grid">
        {data.firearms.map((f) => (
          <Link
            className="card firearm-card"
            key={f.id}
            href={"/firearms/" + f.id}
          >
            <Target size={32} />
            <span className="pill">
              {f.archived ? "Arkiverat" : "Aktivt"} · {f.group}
            </span>
            <h2>{f.nickname || f.make + " " + f.model}</h2>
            <p>
              {f.make} {f.model} · {f.caliber}
            </p>
            {f.defaultDiscipline && (
              <p className="muted">
                Förvald gren: {discipline(f.defaultDiscipline).name}
              </p>
            )}
            <span className="inline-link">Visa / redigera →</span>
          </Link>
        ))}
      </div>
      {!data.firearms.length && (
        <section className="card empty">
          <h2>Gör journalen personlig</h2>
          <p>
            Lägg till ditt första vapen. Du kan även logga pass med lånade
            vapen.
          </p>
        </section>
      )}
    </>
  );
}
