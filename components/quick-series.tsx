"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Zap, Check, Trash2 } from "lucide-react";
import { disciplines, discipline } from "@/lib/disciplines";
import type { QuickEntry, Session, Result } from "@/lib/models";
import { mutate } from "./mutate";
export type QuickSummary = Pick<
  QuickEntry,
  "id" | "date" | "discipline" | "result" | "notes" | "recordedAt"
>;
export function QuickSeries({
  entries,
  sessions,
  today,
}: {
  entries: QuickSummary[];
  sessions: Pick<
    Session,
    "id" | "date" | "discipline" | "location" | "revision"
  >[];
  today: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [sport, setSport] = useState<Session["discipline"]>("precision");
  const [shots, setShots] = useState("5");
  const [points, setPoints] = useState("");
  const [hits, setHits] = useState("");
  const [figures, setFigures] = useState("");
  const [x, setX] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [targetSession, setTargetSession] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Reuse the same ID after an uncertain network response so retry cannot duplicate a series.
  const pending = useRef<{ key: string; id: string } | null>(null);
  const scoreInput = useRef<HTMLInputElement>(null);
  const kind = discipline(sport).kind;
  const chosen = entries.filter((q) => selected.includes(q.id));
  const matching = sessions.filter(
    (s) =>
      chosen.length > 0 &&
      chosen.every((q) => q.date === s.date && q.discipline === s.discipline),
  );
  const compatible =
    chosen.length > 0 &&
    chosen.every(
      (q) => q.date === chosen[0].date && q.discipline === chosen[0].discipline,
    );
  async function run(action: string, payload: unknown, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mutate(action, payload);
      setMessage(success);
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const key = JSON.stringify({
      date,
      sport,
      shots,
      points,
      hits,
      figures,
      x,
      notes,
    });
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    const id = pending.current.id;
    const result: Result = {
      id,
      label: "Serie",
      type: sport === "application" ? "application" : "score",
      shots: Number(shots),
      ...(["points", "dynamic"].includes(kind) && points !== ""
        ? { points: Number(points) }
        : {}),
      ...(kind !== "points" && hits !== "" ? { hits: Number(hits) } : {}),
      ...(kind === "field" && figures !== ""
        ? { figures: Number(figures) }
        : {}),
      ...(kind === "points" && x !== "" ? { x: Number(x) } : {}),
    };
    if (
      await run(
        "quick-entry",
        { id, date, discipline: sport, result, notes },
        "Serien är sparad. Klar för nästa!",
      )
    ) {
      pending.current = null;
      setPoints("");
      setHits("");
      setFigures("");
      setX("");
      setNotes("");
      scoreInput.current?.focus();
    }
  }
  function select(id: string) {
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
    setTargetSession("");
  }
  return (
    <div className="quick-entry-layout">
      <form className="card quick-form" onSubmit={save}>
        <div className="section-heading">
          <h2>
            <Zap size={20} /> Nästa serie
          </h2>
          <span className="pill">På banan</span>
        </div>
        <fieldset disabled={busy} className="quick-controls">
          <div className="quick-context">
            <label>
              Datum
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Gren
              <select
                value={sport}
                onChange={(e) => {
                  const id = e.target.value as Session["discipline"];
                  setSport(id);
                  setShots(id === "application" ? "6" : "5");
                  setPoints("");
                  setHits("");
                  setFigures("");
                  setX("");
                }}
              >
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="quick-score-grid">
            <label>
              Antal skott
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="1000"
                step="1"
                required
                value={shots}
                onChange={(e) => setShots(e.target.value)}
              />
            </label>
            {["points", "dynamic"].includes(kind) && (
              <label className="quick-score">
                Poäng
                <input
                  ref={scoreInput}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={sport === "precision" ? Number(shots) * 10 : undefined}
                  step="any"
                  required={kind === "points"}
                  placeholder="–"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                />
              </label>
            )}
            {kind !== "points" && (
              <label className="quick-score">
                Träffar
                <input
                  ref={kind === "dynamic" ? undefined : scoreInput}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={Number(shots)}
                  step="1"
                  required={kind !== "dynamic"}
                  placeholder="–"
                  value={hits}
                  onChange={(e) => setHits(e.target.value)}
                />
              </label>
            )}
          </div>
          <details className="quick-details">
            <summary>Fler uppgifter</summary>
            <div className="form-grid">
              {kind === "points" && (
                <label>
                  Innertior
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={Number(shots)}
                    step="1"
                    value={x}
                    onChange={(e) => setX(e.target.value)}
                  />
                </label>
              )}
              {kind === "field" && (
                <label>
                  Träffade figurer
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={Number(hits)}
                    step="1"
                    value={figures}
                    onChange={(e) => setFigures(e.target.value)}
                  />
                </label>
              )}
              <label>
                Anteckning
                <textarea
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </details>
          <p className="muted">
            Vapen, plats, avstånd, måltyp och skjuttid väljer du när serien
            kopplas till ett pass. Valör visas därefter.
          </p>
          <button className="quick-save" disabled={busy}>
            <Plus size={20} /> {busy ? "Sparar…" : "Spara serie & nästa"}
          </button>
        </fieldset>
      </form>
      <section className="card quick-inbox">
        <div className="section-heading">
          <h2>Okopplade serier</h2>
          <span className="pill">{entries.length}</span>
        </div>
        <p className="muted">
          Välj serier från samma datum och gren för att samla dem i ett pass.
        </p>
        {entries.length === 0 && (
          <p>Här visas dina snabbregistrerade serier.</p>
        )}
        <div className="quick-series-list">
          {entries.map((q) => (
            <div className="quick-series-row" key={q.id}>
              <label className="quick-series-choice">
                <input
                  type="checkbox"
                  checked={selected.includes(q.id)}
                  onChange={() => select(q.id)}
                  disabled={busy}
                />
                <span>
                  <strong>
                    {q.result.points !== undefined
                      ? `${q.result.points} poäng`
                      : `${q.result.hits ?? 0} träffar`}
                  </strong>
                  <small>
                    {q.result.shots} skott · {q.date} ·{" "}
                    {discipline(q.discipline).name}
                  </small>
                  {q.notes && <small>{q.notes}</small>}
                </span>
              </label>
              <button
                type="button"
                className="text-button danger quick-remove"
                aria-label={`Ta bort serie ${q.date}, ${q.result.points ?? q.result.hits ?? 0}`}
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      "delete-quick-entry",
                      { id: q.id },
                      "Serien är borttagen.",
                    )
                  )
                    setSelected((ids) => ids.filter((id) => id !== q.id));
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        {chosen.length > 0 && (
          <div className="quick-link-actions">
            <strong>{chosen.length} serier valda</strong>
            {!compatible && (
              <p className="notice">Välj serier med samma datum och gren.</p>
            )}
            {compatible && (
              <Link
                className="button secondary"
                href={`/sessions/new?quick=${chosen.map((q) => q.id).join(",")}`}
              >
                Skapa pass med serierna →
              </Link>
            )}
            <label>
              Koppla till befintligt pass
              <select
                value={targetSession}
                onChange={(e) => setTargetSession(e.target.value)}
                disabled={busy || !matching.length}
              >
                <option value="">
                  {matching.length
                    ? "Välj pass"
                    : "Inget pass med samma datum och gren"}
                </option>
                {matching.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} · {s.location || "Plats ej angiven"} ·{" "}
                    {discipline(s.discipline).name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !targetSession}
              onClick={async () => {
                const s = matching.find((s) => s.id === targetSession);
                if (
                  s &&
                  (await run(
                    "attach-quick",
                    {
                      ids: chosen.map((q) => q.id),
                      sessionId: s.id,
                      revision: s.revision,
                    },
                    "Serierna är kopplade till passet.",
                  ))
                ) {
                  setSelected([]);
                  router.push(`/sessions/${s.id}`);
                }
              }}
            >
              <Check size={18} /> Koppla valda serier
            </button>
          </div>
        )}
      </section>
      <div className="quick-feedback" aria-live="polite">
        {message && <p className="notice">{message}</p>}
        {error && (
          <p className="notice" role="alert">
            {error} Uppgifterna behålls. Försök igen.
          </p>
        )}
      </div>
    </div>
  );
}
