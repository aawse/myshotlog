"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { calibers } from "@/lib/options";
import { disciplines } from "@/lib/disciplines";
import type { Firearm } from "@/lib/models";
import { mutate } from "./mutate";
export function FirearmForm({ initial }: { initial?: Firearm }) {
  const router = useRouter();
  const [f, setF] = useState<Firearm>(
    () =>
      initial ?? {
        id: crypto.randomUUID(),
        make: "",
        model: "",
        caliber: "",
        group: "C",
        serial: "",
        nickname: "",
        notes: "",
        archived: false,
        defaultDiscipline: null,
      },
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate("firearm", f);
      router.push("/firearms");
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form card" onSubmit={save}>
      <div className="form-grid">
        {(
          [
            ["Tillverkare", "make"],
            ["Modell", "model"],
            ["Vapengrupp / programspecifik klass", "group"],
            ["Smeknamn", "nickname"],
            ["Serienummer (valfritt)", "serial"],
          ] as const
        ).map(([label, key]) => (
          <label key={key}>
            {label}
            <input
              value={f[key]}
              required={["make", "model", "caliber", "group"].includes(key)}
              maxLength={key === "serial" ? 150 : 100}
              onChange={(e) => setF({ ...f, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Kaliber
          <select
            name="caliber"
            required
            value={f.caliber}
            onChange={(e) => setF({ ...f, caliber: e.target.value })}
          >
            <option value="">Välj kaliber</option>
            {f.caliber && !calibers.some((c) => c.value === f.caliber) && (
              <option value={f.caliber}>{f.caliber} (tidigare sparad)</option>
            )}
            {calibers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Förvald gren
          <select
            value={f.defaultDiscipline ?? ""}
            onChange={(e) =>
              setF({
                ...f,
                defaultDiscipline: (e.target.value ||
                  null) as Firearm["defaultDiscipline"],
              })
            }
          >
            <option value="">Ingen förvald gren</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        Klassificeringen anges av dig och måste kontrolleras mot reglerna för
        respektive gren. Serienummer visas bara här och i din personliga
        JSON-export. Vapnets förvalda gren väljs automatiskt när du väljer
        vapnet i ett nytt pass. Du kan sedan ändra grenen själv.
      </p>
      <label>
        Anteckningar
        <textarea
          maxLength={3000}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={f.archived}
          onChange={(e) => setF({ ...f, archived: e.target.checked })}
        />{" "}
        Arkiverat (bevarar historiken)
      </label>
      {message && <p role="alert">{message}</p>}
      <button disabled={busy}>{busy ? "Sparar…" : "Spara vapen"} →</button>
    </form>
  );
}
