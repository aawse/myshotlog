"use client";
import {
  eventPrograms,
  applyProgram,
  programName,
} from "@/lib/events/programs";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "@/components/language-provider";
import { useRef, useState, useMemo } from "react";
import Link from "next/link";
import { PhotoViewer } from "./photo-viewer";
import { TargetPhotoInput } from "./target-photo-input";
import type { PhotoDraft } from "@/lib/photos/schema";
import { useJournalRouter } from "./journal-navigation";
import { Plus, Zap, Check, Trash2 } from "lucide-react";
import { disciplineName } from "@/lib/i18n-domain";
import { disciplines, discipline } from "@/lib/disciplines";
import type { QuickEntry, Session, Result } from "@/lib/models";
import { mutate } from "./mutate";
export type QuickSummary = Pick<
  QuickEntry,
  "id" | "date" | "discipline" | "result" | "notes" | "recordedAt" | "presetId"
>;
export function QuickSeries({
  entries,
  sessions,
  today,
}: {
  entries: QuickSummary[];
  sessions: Pick<
    Session,
    "id" | "date" | "discipline" | "location" | "revision" | "presetId"
  >[];
  today: string;
}) {
  const { tr, language } = useI18n();

  const router = useJournalRouter();
  const [date, setDate] = useState(today);
  const [sport, setSport] = useState<Session["discipline"]>("precision");
  const [shots, setShots] = useState("5");
  const [points, setPoints] = useState("");
  const [hits, setHits] = useState("");
  const [figures, setFigures] = useState("");
  const [x, setX] = useState("");
  const [notes, setNotes] = useState("");
  const [label, setLabel] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [dryFire, setDryFire] = useState(false);
  const [programId, setProgramId] = useState("");
  const [programStage, setProgramStage] = useState(0);
  const [stageUnit, setStageUnit] = useState<"m" | "yd">("yd");
  const eventChoices = eventPrograms(sport);
  const presetResults = useMemo(() => {
    const program = eventPrograms(sport).find((p) => p.id === programId);
    if (!program) return [];
    return applyProgram(
      {
        id: "",
        date,
        time: "",
        location: "",
        discipline: sport,
        program: "",
        group: "",
        firearmId: null,
        firearmSnapshot: null,
        context: "practice",
        notes: "",
        results: [],
        revision: 0,
      },
      program,
      language,
      undefined,
      { unit: stageUnit },
    ).results;
  }, [programId, sport, date, language, stageUnit]);
  const selectedStage = presetResults[programStage];
  const [photo, setPhoto] = useState<PhotoDraft>();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetSession, setTargetSession] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Reuse the same ID after an uncertain network response so retry cannot duplicate a series.
  const pending = useRef<{
    key: string;
    id: string;
  } | null>(null);
  const scoreInput = useRef<HTMLInputElement>(null);
  const kind = discipline(sport).kind;
  const chosen = entries.filter((q) => selected.includes(q.id));
  const matching = sessions.filter(
    (s) =>
      chosen.length > 0 &&
      chosen.every(
        (q) =>
          q.date === s.date &&
          q.discipline === s.discipline &&
          (!q.presetId || q.presetId === s.presetId),
      ),
  );
  const compatible =
    chosen.length > 0 &&
    chosen.every(
      (q) =>
        q.date === chosen[0].date &&
        q.discipline === chosen[0].discipline &&
        q.presetId === chosen[0].presetId,
    );
  async function run(
    action: string,
    payload: unknown,
    success: string,
    photos: PhotoDraft[] = [],
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mutate(action, payload, photos);
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
    if (photoBusy) return;
    const key = JSON.stringify({
      date,
      sport,
      shots,
      points,
      hits,
      figures,
      x,
      notes,
      label,
      programId,
      programStage,
      stageUnit,
      elapsed,
      dryFire,
      photoId: photo?.id,
    });
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    const id = pending.current.id;
    const result: Result = {
      id,
      label: label.trim() || selectedStage?.label || tr("common.seriesLabel"),
      ...(selectedStage
        ? {
            stageDistance: selectedStage.stageDistance,
            stageDistanceUnit: selectedStage.stageDistanceUnit,
            stageTimeLimit: selectedStage.stageTimeLimit,
            stageTarget: selectedStage.stageTarget,
          }
        : {}),
      ...(sport === "custom" && dryFire ? { dryFire: true } : {}),
      ...(elapsed !== "" ? { elapsedSeconds: Number(elapsed) } : {}),
      ...(photo ? { photoId: photo.id } : {}),
      type: sport === "application" ? "application" : "score",
      shots: Number(shots),
      ...(sport !== "nordic-steel" &&
      ["points", "dynamic", "open"].includes(kind) &&
      points !== ""
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
        {
          id,
          date,
          discipline: sport,
          result,
          notes,
          ...(programId ? { presetId: programId } : {}),
        },
        tr("quick.saved"),
        photo ? [photo] : [],
      )
    ) {
      pending.current = null;
      setPoints("");
      setHits("");
      setFigures("");
      setX("");
      setNotes("");
      setPhoto(undefined);
      setElapsed("");
      if (selectedStage && programStage + 1 < presetResults.length) {
        setProgramStage(programStage + 1);
        setShots(String(presetResults[programStage + 1].shots));
        setLabel("");
      }
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
            <Zap size={20} /> {tr("quick.next")}
          </h2>
          <span className="pill">{tr("quick.atRange")}</span>
        </div>
        <fieldset disabled={busy} className="quick-controls">
          <div className="quick-context">
            <label>
              {tr("common.date")}
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              {tr("session.sport")}
              <select
                value={sport}
                onChange={(e) => {
                  const id = e.target.value as Session["discipline"];
                  setSport(id);
                  setProgramId("");
                  setProgramStage(0);
                  setDryFire(false);
                  setLabel("");
                  setElapsed("");
                  setShots(id === "application" ? "6" : "5");
                  setPoints("");
                  setHits("");
                  setFigures("");
                  setX("");
                }}
              >
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {disciplineName(language, d.id)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {sport !== "custom" && (
            <div className="form-grid">
              <label>
                {tr("event.select")}
                <select
                  value={programId}
                  onChange={(e) => {
                    setProgramId(e.target.value);
                    setProgramStage(0);
                    setLabel("");
                    const program = eventChoices.find(
                      (p) => p.id === e.target.value,
                    );
                    if (program) {
                      const first = applyProgram(
                        {
                          id: "",
                          date,
                          time: "",
                          location: "",
                          discipline: sport,
                          program: "",
                          group: "",
                          firearmId: null,
                          firearmSnapshot: null,
                          context: "practice",
                          notes: "",
                          results: [],
                          revision: 0,
                        },
                        program,
                        language,
                        undefined,
                        { unit: stageUnit },
                      ).results[0];
                      setShots(String(first.shots));
                    }
                  }}
                >
                  <option value="">{tr("event.manual")}</option>
                  {eventChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {programName(p, language)}
                    </option>
                  ))}
                </select>
              </label>
              {presetResults.length > 0 && (
                <label>
                  {tr("session.resultName")}
                  <select
                    value={programStage}
                    onChange={(e) => {
                      const i = Number(e.target.value);
                      setProgramStage(i);
                      setShots(String(presetResults[i].shots));
                      setLabel("");
                    }}
                  >
                    {presetResults.map((r, i) => (
                      <option key={r.id} value={i}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {sport === "ppc" && selectedStage && (
                <label>
                  {tr("event.unit")}
                  <select
                    value={stageUnit}
                    onChange={(e) => setStageUnit(e.target.value as "m" | "yd")}
                  >
                    <option value="yd">{tr("event.unitYards")}</option>
                    <option value="m">{tr("event.unitMeters")}</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {sport === "custom" && (
            <label>
              {tr("session.customEvent")}
              <input
                required
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          )}
          {["time", "dynamic", "open"].includes(kind) && (
            <label>
              {tr("session.elapsedSeconds")}
              <input
                type="number"
                min="0.01"
                step="any"
                value={elapsed}
                onChange={(e) => setElapsed(e.target.value)}
              />
            </label>
          )}
          {sport === "custom" && (
            <label>
              <input
                type="checkbox"
                checked={dryFire}
                onChange={(e) => {
                  setDryFire(e.target.checked);
                  setShots(e.target.checked ? "0" : "5");
                  setHits("");
                }}
              />
              {tr("session.dryFire")}
            </label>
          )}
          <div className="quick-score-grid">
            <label>
              {tr("quick.shots")}
              <input
                type="number"
                inputMode="numeric"
                min={sport === "custom" && dryFire ? "0" : "1"}
                max="1000"
                step="1"
                required
                value={shots}
                onChange={(e) => setShots(e.target.value)}
              />
            </label>
            {sport !== "nordic-steel" &&
              ["points", "dynamic", "open"].includes(kind) && (
                <label className="quick-score">
                  {tr("session.points")}
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
                {tr("session.hits")}
                <input
                  ref={kind === "dynamic" ? undefined : scoreInput}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={Number(shots)}
                  step="1"
                  required={
                    sport === "nordic-steel" ||
                    !["dynamic", "open"].includes(kind)
                  }
                  placeholder="–"
                  value={hits}
                  onChange={(e) => setHits(e.target.value)}
                />
              </label>
            )}
          </div>
          <TargetPhotoInput
            draft={photo}
            onChange={setPhoto}
            onBusyChange={setPhotoBusy}
            disabled={busy}
          />
          <details className="quick-details">
            <summary>{tr("quick.more")}</summary>
            <div className="form-grid">
              {kind === "points" && (
                <label>
                  {tr("quick.innerTens")}
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
                  {tr("quick.figures")}
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
                {tr("quick.note")}
                <textarea
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </details>
          <p className="muted">{tr("quick.sessionHelp")}</p>
          <button className="quick-save" disabled={busy || photoBusy}>
            <Plus size={20} />{" "}
            {photoBusy
              ? tr("quick.optimizing")
              : busy
                ? tr("common.saving")
                : tr("quick.saveNext")}
          </button>
        </fieldset>
      </form>
      <section className="card quick-inbox">
        <div className="section-heading">
          <h2>{tr("quick.inbox")}</h2>
          <span className="pill">{entries.length}</span>
        </div>
        <p className="muted">{tr("quick.inboxHelp")}</p>
        {entries.length === 0 && <p>{tr("quick.empty")}</p>}
        <div className="quick-series-list">
          {entries.map((q) => (
            <div className="quick-series-row" key={q.id}>
              <div>
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
                        ? tr("quick.points", { p0: q.result.points })
                        : tr("quick.hits", { p0: q.result.hits ?? 0 })}
                    </strong>
                    <small>
                      {q.result.shots} {tr("details.shotsSeparator")} {q.date} ·{" "}
                      {disciplineName(language, q.discipline)}
                    </small>
                    {q.notes && <small>{q.notes}</small>}
                  </span>
                </label>
                {q.result.photoId && (
                  <PhotoViewer
                    src={"/api/photos/" + q.result.photoId + "/"}
                    label={q.result.label}
                  />
                )}
              </div>
              <button
                type="button"
                className="text-button danger quick-remove"
                aria-label={tr("quick.removeLabel", {
                  p0: q.date,
                  p1: q.result.points ?? q.result.hits ?? 0,
                })}
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      "delete-quick-entry",
                      { id: q.id },
                      tr("quick.removed"),
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
            <strong>
              {chosen.length} {tr("quick.selected")}
            </strong>
            {!compatible && (
              <p className="notice">{tr("quick.compatibleHelp")}</p>
            )}
            {compatible && (
              <Link
                className="button secondary"
                href={`/sessions/new/?quick=${chosen.map((q) => q.id).join(",")}`}
              >
                {tr("quick.createSession")}
              </Link>
            )}
            <label>
              {tr("quick.linkExisting")}
              <select
                value={targetSession}
                onChange={(e) => setTargetSession(e.target.value)}
                disabled={busy || !matching.length}
              >
                <option value="">
                  {matching.length
                    ? tr("quick.selectSession")
                    : tr("quick.noSession")}
                </option>
                {matching.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} · {s.location || tr("quick.noLocation")} ·{" "}
                    {disciplineName(language, s.discipline)}
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
                    tr("quick.linked"),
                  ))
                ) {
                  setSelected([]);
                  router.push(`/sessions/${s.id}/`);
                }
              }}
            >
              <Check size={18} /> {tr("quick.linkSelected")}
            </button>
          </div>
        )}
      </section>
      <div className="quick-feedback" aria-live="polite">
        {message && (
          <p className="notice">{localizeMessage(language, message)}</p>
        )}
        {error && (
          <p className="notice" role="alert">
            {localizeMessage(language, error)} {tr("quick.retry")}
          </p>
        )}
      </div>
    </div>
  );
}
