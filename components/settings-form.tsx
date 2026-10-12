"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { todayInTimezone, type Profile } from "@/lib/models";
import { csv, exportRecords } from "@/lib/portability";
import type { Records } from "@/lib/models";
import { mutate } from "./mutate";
export function SettingsForm({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState("");
  const router = useRouter();
  async function act(action: string, payload: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const result = await mutate(action, payload);
      setMessage(
        action === "import"
          ? `${result.imported} pass importerade. Dubbletter hoppades över.`
          : "Sparat.",
      );
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(format: "json" | "csv") {
    setBusy(true);
    setMessage("Förbereder export…");
    try {
      const read = async (part: string, offset = 0) => {
        const res = await fetch(`/api/records?part=${part}&offset=${offset}`);
        if (!res.ok) throw new Error("Exporten kunde inte hämtas.");
        return res.json();
      };
      const all = async (part: string) => {
        const items = [];
        for (let offset = 0; ; offset += 10) {
          const page = await read(part, offset);
          items.push(...page);
          if (page.length < 10) break;
        }
        return items;
      };
      const [profile, firearms, sessions, assessments, quickEntries] =
        await Promise.all([
          read("profile"),
          all("firearms"),
          all("sessions"),
          all("assessments"),
          all("quickEntries"),
        ]);
      const data: Records = {
        profile,
        firearms,
        sessions,
        assessments,
        quickEntries,
      };
      const blob = new Blob(
        [
          format === "json"
            ? JSON.stringify(exportRecords(data), null, 2)
            : csv(sessions),
        ],
        {
          type:
            format === "json" ? "application/json" : "text/csv;charset=utf-8",
        },
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = format === "json" ? "MyShotLog-v1.json" : "MyShotLog.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Exporten är klar.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          act("profile", p);
        }}
      >
        <h2>Din profil</h2>
        <div className="form-grid">
          <label>
            Visningsnamn
            <input
              value={p.displayName}
              maxLength={100}
              onChange={(e) => setP({ ...p, displayName: e.target.value })}
            />
          </label>
          <label>
            Födelsedatum (valfritt)
            <input
              type="date"
              min="1900-01-01"
              max={todayInTimezone(profile.timezone)}
              value={p.birthDate ?? ""}
              onChange={(e) =>
                setP({
                  ...p,
                  birthDate: e.target.value || null,
                  birthYear: e.target.value
                    ? Number(e.target.value.slice(0, 4))
                    : null,
                })
              }
            />
          </label>
          <label>
            Språk
            <select
              value={p.language}
              onChange={(e) =>
                setP({ ...p, language: e.target.value as "sv" | "en" })
              }
            >
              <option value="sv">Svenska</option>
              <option value="en">English (gränssnitt kommer senare)</option>
            </select>
          </label>
          <label>
            Tidszon
            <input
              value={p.timezone}
              onChange={(e) => setP({ ...p, timezone: e.target.value })}
            />
          </label>
        </div>
        <p className="muted">
          Födelsedatum används för åldersregeln vid brons-, silver- och
          guldserier. Precisionens poängkrav sänks med 1 poäng från 55 år och 2
          poäng från 65 år, räknat vid slutet av föregående kalenderår.
          Tillämpningskraven ändras inte. Regler väljs efter passets datum.
          Tidigare sparade födelseuppgifter används när de finns; äldre serier
          utan sådant underlag använder profilen. Utan födelseuppgifter används
          ordinarie poänggränser utan åldersavdrag.
        </p>
        {!p.birthDate && p.birthYear !== null && (
          <p className="muted">
            Tidigare sparat födelseår: {p.birthYear}. Det används tills du anger
            ett födelsedatum.
          </p>
        )}
        <div className="actions">
          <button disabled={busy}>Spara profil</button>
          <button
            type="button"
            className="secondary"
            disabled={busy || (!p.birthDate && p.birthYear === null)}
            onClick={() => setP({ ...p, birthDate: null, birthYear: null })}
          >
            Rensa födelseuppgifter
          </button>
        </div>
      </form>
      <section className="card">
        <h2>Din data, med dig</h2>
        <p>
          JSON innehåller vapen, profil, råresultat och bedömningshistorik. CSV
          innehåller resultat för kalkylblad.
        </p>
        <div className="actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => download("json")}
          >
            Exportera JSON
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => download("csv")}
          >
            Exportera CSV
          </button>
        </div>
        <label>
          Importera version 1 JSON (max 3 MB)
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 3_000_000) {
                setMessage("Maximal filstorlek är 3 MB.");
                return;
              }
              try {
                await act("import", JSON.parse(await file.text()));
              } catch {
                setMessage("Filen är inte giltig JSON.");
              }
              e.target.value = "";
            }}
          />
        </label>
        <p className="muted">
          Samma ID hoppas över. Importen är atomär och påverkar endast ditt
          konto. Befintlig profil behålls. Importerade bedömningar är personligt
          historikunderlag, inte verifierade intyg.
        </p>
      </section>
      <section className="card">
        <h2>Radera journalen</h2>
        <p>
          Detta tar bort dina pass, vapen, profil och bedömningar från aktuell
          journal. Tidigare versioner finns kvar i Git-historiken. Exportera
          först om du vill spara en kopia.
        </p>
        <label>
          Skriv RADERA
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button
          className="danger-button"
          disabled={busy || confirm !== "RADERA"}
          onClick={() => act("delete-records", { confirm })}
        >
          Radera mina uppgifter
        </button>
        <p className="muted">
          För att även stänga kontot: kontakta instansägaren. Ägaren tar bort
          ditt GitHub-ID ur serverns lista över tillåtna konton. För fullständig
          radering behövs även hantering av Git-historik, kloner och backuper.
        </p>
      </section>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
