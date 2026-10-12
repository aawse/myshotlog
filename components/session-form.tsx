"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { targets, targetLabel } from "@/lib/options";
import { Plus, Trash2 } from "lucide-react";
import { disciplines, discipline } from "@/lib/disciplines";
import type { Session, Firearm, Result, QuickEntry } from "@/lib/models";
import {
  sessionSetup,
  changeDiscipline,
  selectFirearm,
  hasMixedLegacyConditions,
} from "@/lib/session-setup";
import { LocationInput } from "./location-input";
import { mutate } from "./mutate";
const entry = (): Result => ({
  id: crypto.randomUUID(),
  label: "Serie 1",
  type: "score",
  shots: 5,
  points: 0,
});
export function SessionForm({
  firearms,
  initial,
  quickEntries = [],
  locations = [],
  timezone = "Europe/Stockholm",
}: {
  firearms: Firearm[];
  initial?: Session;
  quickEntries?: Pick<
    QuickEntry,
    "id" | "date" | "discipline" | "result" | "notes"
  >[];
  locations?: string[];
  timezone?: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session>(() =>
    initial
      ? sessionSetup(initial)
      : {
          id: crypto.randomUUID(),
          date:
            quickEntries[0]?.date ??
            new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(
              new Date(),
            ),
          time: "",
          location: "",
          discipline: quickEntries[0]?.discipline ?? "precision",
          program: quickEntries[0]
            ? discipline(quickEntries[0].discipline).name
            : "5-skottsserier",
          seconds:
            quickEntries[0] && quickEntries[0].discipline !== "precision"
              ? null
              : 300,
          distance:
            quickEntries[0] && quickEntries[0].discipline !== "precision"
              ? null
              : 25,
          target:
            quickEntries[0] && quickEntries[0].discipline !== "precision"
              ? null
              : "precision25",
          firearmId: null,
          firearmSnapshot: null,
          group: "C",
          context: "practice",
          notes: quickEntries
            .map((q) => q.notes)
            .filter(Boolean)
            .join("\n"),
          results: quickEntries.length
            ? quickEntries.map((q) => q.result)
            : [entry()],
          revision: 0,
        },
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const kind = discipline(session.discipline).kind;
  const patch = (p: Partial<Session>) => setSession((s) => ({ ...s, ...p }));
  const resultPatch = (id: string, p: Partial<Result>) =>
    patch({
      results: session.results.map((r) => (r.id === id ? { ...r, ...p } : r)),
    });
  const field = (
    label: string,
    key: keyof Result,
    r: Result,
    required = false,
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        min="0"
        step={["shots", "hits", "figures", "x"].includes(key) ? "1" : "any"}
        required={required}
        value={(r[key] as number | undefined) ?? ""}
        onChange={(e) =>
          resultPatch(r.id, {
            [key]: e.target.value === "" ? undefined : Number(e.target.value),
          })
        }
      />
    </label>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = { ...session, revision: session.revision + 1 };
      await mutate(
        quickEntries.length ? "session-with-quick" : "session",
        quickEntries.length
          ? { session: saved, ids: quickEntries.map((q) => q.id) }
          : saved,
      );
      router.push("/sessions/" + session.id);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="form">
      {quickEntries.length > 0 && (
        <p className="notice">
          {quickEntries.length} snabbserier kopplas när du sparar passet. Datum
          och gren behålls.
        </p>
      )}
      <section className="card">
        <h2>Om passet</h2>
        <div className="form-grid">
          <label>
            Datum
            <input
              disabled={quickEntries.length > 0}
              type="date"
              value={session.date}
              required
              onChange={(e) => patch({ date: e.target.value })}
            />
          </label>
          <label>
            Starttid (valfritt)
            <input
              type="time"
              value={session.time}
              onChange={(e) => patch({ time: e.target.value })}
            />
          </label>
          <LocationInput
            value={session.location}
            locations={locations}
            onChange={(value) => patch({ location: value })}
          />
          <label>
            Gren
            <select
              disabled={quickEntries.length > 0}
              value={session.discipline}
              onChange={(e) => {
                setSession((s) =>
                  changeDiscipline(s, e.target.value as Session["discipline"]),
                );
              }}
            >
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Program / moment
            <input
              required
              maxLength={120}
              value={session.program}
              onChange={(e) => patch({ program: e.target.value })}
            />
          </label>
          <label>
            Vapen
            <select
              value={session.firearmId ?? ""}
              onChange={(e) => {
                const f = firearms.find((f) => f.id === e.target.value);
                setSession((s) =>
                  selectFirearm(
                    s,
                    f,
                    Boolean(initial) || quickEntries.length > 0,
                  ),
                );
              }}
            >
              <option value="">Lånat / inget registrerat vapen</option>
              {firearms
                .filter((f) => !f.archived || f.id === initial?.firearmId)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nickname || f.make + " " + f.model}
                    {f.archived ? " (arkiverat)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Vapengrupp / klassificering
            <input
              value={session.group}
              required
              maxLength={100}
              list="groups"
              onChange={(e) => patch({ group: e.target.value })}
            />
            <datalist id="groups">
              {["A", "A optisk", "B", "C", "R"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </datalist>
          </label>
          <label>
            Avstånd (meter)
            <input
              type="number"
              min="0"
              step="any"
              value={session.distance ?? ""}
              onChange={(e) =>
                patch({
                  distance:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Skjuttid (sekunder)
            <input
              name="seconds"
              type="number"
              min="0"
              step="any"
              required={["time", "dynamic"].includes(kind)}
              value={session.seconds ?? ""}
              onChange={(e) =>
                patch({
                  seconds:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Måltyp
            <select
              name="target"
              value={session.target ?? ""}
              onChange={(e) => patch({ target: e.target.value || null })}
            >
              <option value="">Välj måltyp</option>
              {session.target &&
                !targets.some((t) => t.value === session.target) && (
                  <option value={session.target}>
                    {session.target} (tidigare sparad)
                  </option>
                )}
              {targets.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sammanhang
            <select
              value={session.context}
              onChange={(e) =>
                patch({ context: e.target.value as Session["context"] })
              }
            >
              <option value="practice">Träning</option>
              <option value="competition">Tävling</option>
            </select>
          </label>
        </div>
        <p className="muted">
          Avstånd, måltyp och skjuttid gäller alla serier i passet.
        </p>
        {hasMixedLegacyConditions(session) && (
          <p className="notice">
            Det här äldre passet har olika avstånd, mål eller tider per serie.
            De behålls tills du väljer ett gemensamt värde ovan.
          </p>
        )}
      </section>
      <section className="card">
        <div className="section-heading">
          <h2>Resultat per serie / station</h2>
          <span className="pill">{session.results.length} poster</span>
        </div>
        <p className="muted">
          Ange råresultat före avdrag. Avdrag anges separat. Tävlingsplacering
          och regelstyrda straff räknas inte automatiskt.
        </p>
        {session.results.map((r, i) => (
          <fieldset className="result-entry" key={r.id}>
            <legend>
              {kind === "field" ? "Station" : "Resultat"} {i + 1}
            </legend>
            {hasMixedLegacyConditions(session) && (
              <p className="muted">
                Äldre serievillkor:{" "}
                {r.distance !== undefined
                  ? r.distance + " m"
                  : "Avstånd ej angivet"}{" "}
                · {r.target ? targetLabel(r.target) : "Måltyp ej angiven"}
              </p>
            )}
            <div className="form-grid">
              <label>
                Namn / moment
                <input
                  value={r.label}
                  maxLength={120}
                  onChange={(e) => resultPatch(r.id, { label: e.target.value })}
                />
              </label>
              {field("Antal skott", "shots", r, true)}
              {["points", "field", "dynamic"].includes(kind) &&
                field(
                  kind === "field" ? "Poängmål (valfritt)" : "Poäng",
                  "points",
                  r,
                  kind === "points",
                )}
              {kind !== "points" &&
                field("Träffar", "hits", r, kind !== "dynamic")}
              {kind === "field" && field("Träffade figurer", "figures", r)}
              {kind === "points" && field("Innertior (valfritt)", "x", r)}
              {["points", "field", "dynamic"].includes(kind) &&
                field("Poängavdrag", "penaltyPoints", r)}
              {["time", "dynamic"].includes(kind) &&
                field("Strafftid (sekunder)", "penaltySeconds", r)}
              {kind === "field" && (
                <label>
                  Räknesätt
                  <select
                    value={r.scoring ?? "ordinary"}
                    onChange={(e) =>
                      resultPatch(r.id, {
                        scoring: e.target.value as Result["scoring"],
                      })
                    }
                  >
                    <option value="ordinary">Vanlig räkning</option>
                    <option value="points">
                      Poängfält (träffar + figurer)
                    </option>
                  </select>
                </label>
              )}
            </div>
            {session.results.length > 1 &&
              !quickEntries.some((q) => q.id === r.id) && (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() =>
                    patch({
                      results: session.results.filter((x) => x.id !== r.id),
                    })
                  }
                >
                  <Trash2 size={15} /> Ta bort post
                </button>
              )}
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={session.results.length >= 100}
          onClick={() =>
            patch({
              results: [
                ...session.results,
                {
                  ...entry(),
                  type:
                    session.discipline === "application"
                      ? "application"
                      : "score",
                  shots: session.discipline === "application" ? 6 : 5,
                  label: "Serie " + (session.results.length + 1),
                  points: kind === "points" ? 0 : undefined,
                  hits: kind !== "points" ? 0 : undefined,
                },
              ],
            })
          }
        >
          <Plus size={16} /> Lägg till serie / station
        </button>
      </section>
      <section className="card">
        <label>
          Anteckningar
          <textarea
            value={session.notes}
            maxLength={5000}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </label>
      </section>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy}>
        {busy ? "Sparar…" : "Spara träningspass"} →
      </button>
    </form>
  );
}
