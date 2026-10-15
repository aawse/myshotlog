"use client";
import {
  eventPrograms,
  programs,
  applyProgram,
  programName,
  classFor,
  distanceText,
  classSuggestions,
  suggestedRuleReference,
} from "@/lib/events/programs";
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
    "id" | "date" | "discipline" | "result" | "notes" | "presetId"
  >[];
  locations?: string[];
  timezone?: string;
}) {
  const { tr, language } = useI18n();

  const router = useJournalRouter();
  const [session, setSession] = useState<Session>(() => {
    const value: Session = initial
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
          presetId: quickEntries[0]?.presetId,
          ruleReference: quickEntries[0]
            ? suggestedRuleReference(
                quickEntries[0].discipline,
                quickEntries[0].date,
              )
            : undefined,
          program: quickEntries[0]
            ? quickEntries[0].discipline === "custom"
              ? quickEntries[0].result.label
              : quickEntries[0].presetId &&
                  programs.find((p) => p.id === quickEntries[0].presetId)
                ? programName(
                    programs.find((p) => p.id === quickEntries[0].presetId)!,
                    language,
                  )
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
        };
    return !initial && !quickEntries.length
      ? applyProgram(value, eventPrograms("precision")[0], language)
      : !initial && quickEntries.length
        ? {
            ...value,
            group:
              classFor(value) ||
              (discipline(value.discipline).kind === "dynamic"
                ? ""
                : value.group),
          }
        : value;
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const baseline = useRef(initial ? sessionSetup(initial) : null);
  const [photos, setPhotos] = useState<Record<string, PhotoDraft>>({});
  const [processingPhotos, setProcessingPhotos] = useState<
    Record<string, boolean>
  >({});
  const photoBusy = Object.values(processingPhotos).some(Boolean);
  const resultDirty = useRef(false);
  const kind = discipline(session.discipline).kind;
  const [stageCount, setStageCount] = useState(initial?.results.length ?? 1);
  const [ppcUnit, setPpcUnit] = useState<"m" | "yd">(
    initial?.results[0]?.stageDistanceUnit ?? "yd",
  );
  const firearm = firearms.find((f) => f.id === session.firearmId);
  const choices = eventPrograms(session.discipline);
  const selectedProgram = programs.find((p) => p.id === session.presetId);
  const hasStageConditions = session.results.some(
    (r) =>
      r.stageDistance !== undefined ||
      r.stageTimeLimit !== undefined ||
      r.stageTarget !== undefined,
  );
  function mayReplace() {
    if (photoBusy || busy) return false;
    return (
      (!initial &&
        !resultDirty.current &&
        session.results.every(
          (r) =>
            !r.photoId &&
            !r.points &&
            !r.hits &&
            !r.x &&
            !r.elapsedSeconds &&
            !r.penaltyPoints &&
            !r.penaltySeconds &&
            !r.scoreText,
        )) ||
      window.confirm(tr("event.replace"))
    );
  }
  function chooseProgram(
    id: string,
    current = session,
    chosenFirearm = firearm,
  ) {
    if (!id) {
      setSession({ ...current, presetId: undefined });
      return;
    }
    const program = programs.find(
      (p) => p.id === id && p.discipline === current.discipline,
    );
    if (program && mayReplace()) {
      resultDirty.current = false;
      setPhotos({});
      setSession(
        applyProgram(current, program, language, chosenFirearm, {
          unit: ppcUnit,
          count: stageCount,
        }),
      );
    }
  }
  function defaultProgram(sport: Session["discipline"], f?: Firearm) {
    const list = eventPrograms(sport);
    if (sport === "ppc")
      return (
        list.find(
          (p) => p.ppcClass === f?.classDefaults?.ppc?.replace(" Optical", ""),
        ) ??
        list.find(
          (p) =>
            p.id ===
            (f?.firearmType === "revolver" ? "ppc-r1500" : "ppc-p1500"),
        )!
      );
    return list[0];
  }
  const patch = (p: Partial<Session>) => setSession((s) => ({ ...s, ...p }));
  const resultPatch = (id: string, p: Partial<Result>) => {
    resultDirty.current = true;
    setSession((s) => ({
      ...s,
      results: s.results.map((r) => (r.id === id ? { ...r, ...p } : r)),
    }));
  };
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
                const sport = e.target.value as Session["discipline"];
                if (!mayReplace()) return;
                resultDirty.current = false;
                setPhotos({});
                const next = changeDiscipline(session, sport, language);
                setSession(
                  applyProgram(
                    next,
                    defaultProgram(sport, firearm),
                    language,
                    firearm,
                    { unit: ppcUnit, count: stageCount },
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
          {!quickEntries.length && (
            <label>
              {tr("event.select")}
              <select
                value={session.presetId ?? ""}
                onChange={(e) => chooseProgram(e.target.value)}
              >
                <option value="">{tr("event.manual")}</option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {programName(p, language)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedProgram?.variable && (
            <label>
              {tr("event.count")}
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={stageCount}
                onChange={(e) => setStageCount(Number(e.target.value))}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (
                    stageCount >= 1 &&
                    stageCount <= 100 &&
                    Number.isInteger(stageCount)
                  )
                    chooseProgram(session.presetId!);
                }}
              >
                {tr("event.apply")}
              </button>
            </label>
          )}
          {session.discipline === "ppc" && !quickEntries.length && (
            <label>
              {tr("event.unit")}
              <select
                value={ppcUnit}
                onChange={(e) => {
                  const unit = e.target.value as "m" | "yd";
                  if (!selectedProgram || !mayReplace()) return;
                  setPpcUnit(unit);
                  setSession(
                    applyProgram(session, selectedProgram, language, firearm, {
                      unit,
                    }),
                  );
                }}
              >
                <option value="yd">{tr("event.unitYards")}</option>
                <option value="m">{tr("event.unitMeters")}</option>
              </select>
            </label>
          )}
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
                const next = selectFirearm(
                  session,
                  f,
                  Boolean(initial) || quickEntries.length > 0,
                  language,
                );
                if (next.discipline !== session.discipline) {
                  if (!mayReplace()) return;
                  setSession(
                    applyProgram(
                      next,
                      defaultProgram(next.discipline, f),
                      language,
                      f,
                      { unit: ppcUnit, count: stageCount },
                    ),
                  );
                } else if (
                  !initial &&
                  !quickEntries.length &&
                  session.discipline === "ppc" &&
                  !resultDirty.current &&
                  session.results.every((r) => !r.points && !r.photoId && !r.x)
                ) {
                  setSession(
                    applyProgram(
                      next,
                      defaultProgram(next.discipline, f),
                      language,
                      f,
                      { unit: ppcUnit },
                    ),
                  );
                } else setSession({ ...next, group: classFor(next, f) });
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
            <span className="muted">{tr("event.classHelp")}</span>
            <datalist id="groups">
              {classSuggestions(session.discipline).map((g) => (
                <option key={g} value={g}>
                  {g === "A optisk" ? tr("domain.optical") : g}
                </option>
              ))}
            </datalist>
          </label>
          {!hasStageConditions && (
            <>
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
                    ["running", "ski", "sra"].includes(session.discipline) &&
                    session.results.some((r) => r.elapsedSeconds === undefined)
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
            </>
          )}
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
        <p className="muted">{tr("event.help")}</p>
        {selectedProgram?.variable && (
          <p className="muted">{tr("event.variableHelp")}</p>
        )}
        {firearm?.hasOptic && !session.group && (
          <p className="notice">{tr("event.opticReview")}</p>
        )}
        {session.discipline === "ppc" &&
          [".22 LR", ".22", ".22 WMR"].includes(firearm?.caliber ?? "") && (
            <p className="notice">{tr("event.ppc22")}</p>
          )}
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
              {hasStageConditions &&
                selectedProgram &&
                !selectedProgram.variable && (
                  <p className="muted">
                    {[
                      distanceText(r),
                      r.stageTimeLimit !== undefined
                        ? `${r.stageTimeLimit} s`
                        : "",
                      r.stageTarget ? targetName(language, r.stageTarget) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              {hasStageConditions &&
                (!selectedProgram || selectedProgram.variable) && (
                  <>
                    {field(tr("session.stageDistance"), "stageDistance", r)}
                    <label>
                      {tr("event.unit")}
                      <select
                        value={r.stageDistanceUnit ?? "m"}
                        onChange={(e) =>
                          resultPatch(r.id, {
                            stageDistanceUnit: e.target.value as "m" | "yd",
                          })
                        }
                      >
                        <option value="m">{tr("event.unitMeters")}</option>
                        <option value="yd">{tr("event.unitYards")}</option>
                      </select>
                    </label>
                    {field(tr("session.stageTimeLimit"), "stageTimeLimit", r)}
                    <label>
                      {tr("session.target")}
                      <select
                        value={r.stageTarget ?? ""}
                        onChange={(e) =>
                          resultPatch(r.id, {
                            stageTarget: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">{tr("session.selectTarget")}</option>
                        {targets.map((t) => (
                          <option key={t.value} value={t.value}>
                            {targetName(language, t.value)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              {session.discipline !== "nordic-steel" &&
                ["points", "field", "dynamic", "open"].includes(kind) &&
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
              {session.discipline !== "nordic-steel" &&
                ["points", "field", "dynamic", "open"].includes(kind) &&
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
                  {session.discipline !== "nordic-steel" &&
                    field(tr("session.matchPercent"), "matchPercent", r)}
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
