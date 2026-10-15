"use client";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "@/components/language-provider";
import { useRef, useState } from "react";
import { useJournalRouter } from "./journal-navigation";
import { disciplineName, targetName } from "@/lib/i18n-domain";
import { targets } from "@/lib/options";
import { Plus, Trash2 } from "lucide-react";
import { disciplines, discipline } from "@/lib/disciplines";
import type { Session, Firearm, Result, QuickEntry } from "@/lib/models";
import {
  sessionSetup,
  changeDiscipline,
  selectFirearm,
  hasMixedLegacyConditions,
} from "@/lib/session-setup";
import { TargetPhotoInput } from "./target-photo-input";
import type { PhotoDraft } from "@/lib/photos/schema";
import { LocationInput } from "./location-input";
import { LoadingIndicator } from "./loading-indicator";
import { mutate } from "./mutate";
const entry = (label: string): Result => ({
  id: crypto.randomUUID(),
  label,
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
  const { tr, language } = useI18n();

  const router = useJournalRouter();
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
            ? quickEntries[0].discipline === "custom"
              ? quickEntries[0].result.label
              : disciplineName(language, quickEntries[0].discipline)
            : tr("session.defaultProgram"),
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
            : [entry(tr("common.seriesLabel") + " 1")],
          revision: 0,
        },
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const baseline = useRef(initial ? sessionSetup(initial) : null);
  const [photos, setPhotos] = useState<Record<string, PhotoDraft>>({});
  const [processingPhotos, setProcessingPhotos] = useState<
    Record<string, boolean>
  >({});
  const photoBusy = Object.values(processingPhotos).some(Boolean);
  const kind = discipline(session.discipline).kind;
  const patch = (p: Partial<Session>) => setSession((s) => ({ ...s, ...p }));
  const resultPatch = (id: string, p: Partial<Result>) =>
    setSession((s) => ({
      ...s,
      results: s.results.map((r) => (r.id === id ? { ...r, ...p } : r)),
    }));
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
        max={key === "matchPercent" ? 100 : undefined}
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
    if (photoBusy || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = { ...session, revision: session.revision + 1 };
      await mutate(
        quickEntries.length ? "session-with-quick" : "session",
        quickEntries.length
          ? { session: saved, ids: quickEntries.map((q) => q.id) }
          : saved,
        Object.entries(photos)
          .filter(([id, photo]) =>
            session.results.some((r) => r.id === id && r.photoId === photo.id),
          )
          .map(([, photo]) => photo),
        [{ kind: "session", id: saved.id, value: baseline.current }],
      );
      router.replace("/sessions/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="form">
      {quickEntries.length > 0 && (
        <p className="notice">
          {quickEntries.length} {tr("session.linkQuickHelp")}
        </p>
      )}
      <section className="card">
        <h2>{tr("session.about")}</h2>
        <div className="form-grid">
          <label>
            {tr("common.date")}
            <input
              disabled={quickEntries.length > 0}
              type="date"
              value={session.date}
              required
              onChange={(e) => patch({ date: e.target.value })}
            />
          </label>
          <label>
            {tr("session.startTime")}
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
            {tr("session.sport")}
            <select
              disabled={quickEntries.length > 0}
              value={session.discipline}
              onChange={(e) => {
                setSession((s) =>
                  changeDiscipline(
                    s,
                    e.target.value as Session["discipline"],
                    language,
                  ),
                );
              }}
            >
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {disciplineName(language, d.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr(
              session.discipline === "custom"
                ? "session.customEvent"
                : "session.program",
            )}
            <input
              required
              maxLength={120}
              value={session.program}
              onChange={(e) => patch({ program: e.target.value })}
            />
          </label>
          {["dynamic", "open"].includes(kind) && (
            <label>
              {tr("session.ruleReference")}
              <input
                maxLength={200}
                value={session.ruleReference ?? ""}
                onChange={(e) =>
                  patch({ ruleReference: e.target.value || undefined })
                }
              />
              <span className="muted">{tr("session.ruleReferenceHelp")}</span>
            </label>
          )}
          <label>
            {tr("session.firearm")}
            <select
              aria-label={tr("session.firearm")}
              value={session.firearmId ?? ""}
              onChange={(e) => {
                const f = firearms.find((f) => f.id === e.target.value);
                setSession((s) =>
                  selectFirearm(
                    s,
                    f,
                    Boolean(initial) || quickEntries.length > 0,
                    language,
                  ),
                );
              }}
            >
              <option value="">{tr("session.borrowed")}</option>
              {firearms
                .filter((f) => !f.archived || f.id === initial?.firearmId)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nickname || f.make + " " + f.model}
                    {f.archived ? tr("common.archivedSuffix") : ""}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {tr("session.group")}
            <input
              value={session.group}
              required
              maxLength={100}
              list="groups"
              onChange={(e) => patch({ group: e.target.value })}
            />
            <datalist id="groups">
              {["A", "A optisk", "B", "C", "R"].map((g) => (
                <option key={g} value={g}>
                  {g === "A optisk" ? tr("domain.optical") : g}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            {tr("session.distance")}
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
            {tr("session.shootingTime")}
            <input
              name="seconds"
              type="number"
              min="0"
              step="any"
              required={
                ["running", "ski", "falling", "sra"].includes(
                  session.discipline,
                ) && session.results.some((r) => r.elapsedSeconds === undefined)
              }
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
            {tr("session.target")}
            <select
              name="target"
              value={session.target ?? ""}
              onChange={(e) => patch({ target: e.target.value || null })}
            >
              <option value="">{tr("session.selectTarget")}</option>
              {session.target &&
                !targets.some((t) => t.value === session.target) && (
                  <option value={session.target}>
                    {session.target} {tr("common.savedPreviously")}
                  </option>
                )}
              {targets.map((t) => (
                <option key={t.value} value={t.value}>
                  {targetName(language, t.value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("session.context")}
            <select
              value={session.context}
              onChange={(e) =>
                patch({ context: e.target.value as Session["context"] })
              }
            >
              <option value="practice">{tr("session.practice")}</option>
              <option value="competition">{tr("session.competition")}</option>
            </select>
          </label>
        </div>
        <p className="muted">{tr("session.sharedHelp")}</p>
        {hasMixedLegacyConditions(session) && (
          <p className="notice">{tr("session.legacyHelp")}</p>
        )}
      </section>
      <section className="card">
        <div className="section-heading">
          <h2>{tr("session.results")}</h2>
          <span className="pill">
            {session.results.length} {tr("details.entries")}
          </span>
        </div>
        <p className="muted">{tr("session.resultsHelp")}</p>
        {session.results.map((r, i) => (
          <fieldset className="result-entry" key={r.id}>
            <legend>
              {kind === "field" ? tr("session.stage") : tr("session.result")}{" "}
              {i + 1}
            </legend>
            {hasMixedLegacyConditions(session) && (
              <p className="muted">
                {tr("session.legacyConditions")}{" "}
                {r.distance !== undefined
                  ? r.distance + " m"
                  : tr("session.noDistance")}{" "}
                ·{" "}
                {r.target
                  ? targetName(language, r.target)
                  : tr("session.noTarget")}
              </p>
            )}
            <div className="form-grid">
              <label>
                {tr("session.resultName")}
                <input
                  value={r.label}
                  maxLength={120}
                  onChange={(e) => resultPatch(r.id, { label: e.target.value })}
                />
              </label>
              {session.discipline === "custom" && (
                <label>
                  <input
                    type="checkbox"
                    checked={r.dryFire ?? false}
                    onChange={(e) =>
                      resultPatch(r.id, {
                        dryFire: e.target.checked || undefined,
                        shots: e.target.checked ? 0 : 5,
                        hits: undefined,
                      })
                    }
                  />
                  {tr("session.dryFire")}
                </label>
              )}
              {field(tr("quick.shots"), "shots", r, true)}
              {["points", "field", "dynamic", "open"].includes(kind) &&
                field(
                  kind === "field"
                    ? tr("session.pointTargets")
                    : tr("session.points"),
                  "points",
                  r,
                  kind === "points",
                )}
              {kind !== "points" &&
                field(
                  tr("session.hits"),
                  "hits",
                  r,
                  !["dynamic", "open"].includes(kind),
                )}
              {kind === "field" && field(tr("quick.figures"), "figures", r)}
              {kind === "points" && field(tr("session.innerTens"), "x", r)}
              {["points", "field", "dynamic", "open"].includes(kind) &&
                field(tr("session.penaltyPoints"), "penaltyPoints", r)}
              {["time", "dynamic", "open"].includes(kind) &&
                field(tr("session.penaltyTime"), "penaltySeconds", r)}
              {["time", "dynamic", "open"].includes(kind) &&
                field(
                  tr("session.elapsedSeconds"),
                  "elapsedSeconds",
                  r,
                  kind === "dynamic" &&
                    session.discipline !== "sra" &&
                    (!r.status || r.status === "completed"),
                )}
              {["dynamic", "open"].includes(kind) && (
                <>
                  {field(tr("session.matchPercent"), "matchPercent", r)}
                  {field(tr("session.placement"), "placement", r)}
                  <label>
                    {tr("session.scoreText")}
                    <input
                      maxLength={240}
                      value={r.scoreText ?? ""}
                      onChange={(e) =>
                        resultPatch(r.id, {
                          scoreText: e.target.value || undefined,
                        })
                      }
                    />
                  </label>
                  <label>
                    {tr("session.resultStatus")}
                    <select
                      value={r.status ?? "completed"}
                      onChange={(e) =>
                        resultPatch(r.id, {
                          status: e.target.value as Result["status"],
                        })
                      }
                    >
                      {(["completed", "dnf", "dq", "dns"] as const).map(
                        (status) => (
                          <option key={status} value={status}>
                            {tr(`resultStatus.${status}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </>
              )}
              {kind === "field" && (
                <label>
                  {tr("session.scoring")}
                  <select
                    value={r.scoring ?? "ordinary"}
                    onChange={(e) =>
                      resultPatch(r.id, {
                        scoring: e.target.value as Result["scoring"],
                      })
                    }
                  >
                    <option value="ordinary">
                      {tr("session.ordinaryScoring")}
                    </option>
                    <option value="points">
                      {tr("session.pointsScoring")}
                    </option>
                  </select>
                </label>
              )}
            </div>
            <TargetPhotoInput
              photoId={r.photoId}
              draft={photos[r.id]}
              disabled={busy}
              onBusyChange={(processing) =>
                setProcessingPhotos((p) => ({ ...p, [r.id]: processing }))
              }
              onChange={(photo) => {
                setPhotos((p) => {
                  const copy = { ...p };
                  if (photo) copy[r.id] = photo;
                  else delete copy[r.id];
                  return copy;
                });
                resultPatch(r.id, { photoId: photo?.id });
              }}
            />
            {session.results.length > 1 &&
              !quickEntries.some((q) => q.id === r.id) && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy || processingPhotos[r.id]}
                  onClick={() =>
                    patch({
                      results: session.results.filter((x) => x.id !== r.id),
                    })
                  }
                >
                  <Trash2 size={15} /> {tr("session.removeResult")}
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
                  ...entry(tr("common.seriesLabel") + " 1"),
                  type:
                    session.discipline === "application"
                      ? "application"
                      : "score",
                  shots: session.discipline === "application" ? 6 : 5,
                  label:
                    tr("common.seriesLabel") +
                    " " +
                    (session.results.length + 1),
                  points: kind === "points" ? 0 : undefined,
                  hits: kind !== "points" ? 0 : undefined,
                },
              ],
            })
          }
        >
          <Plus size={16} /> {tr("session.addResult")}
        </button>
      </section>
      <section className="card">
        <label>
          {tr("common.notes")}
          <textarea
            value={session.notes}
            maxLength={5000}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </label>
      </section>
      {error && (
        <p className="notice" role="alert">
          {localizeMessage(language, error)}
        </p>
      )}
      {busy && <LoadingIndicator label={tr("common.saving")} />}
      <button disabled={busy || photoBusy} aria-busy={busy}>
        {photoBusy
          ? tr("quick.optimizing")
          : busy
            ? tr("common.saving")
            : tr("session.save")}{" "}
        →
      </button>
    </form>
  );
}
