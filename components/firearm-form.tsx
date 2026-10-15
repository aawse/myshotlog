"use client";
import { classSuggestions } from "@/lib/events/programs";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "@/components/language-provider";
import { useRef, useState } from "react";
import { useJournalRouter } from "./journal-navigation";
import { calibers } from "@/lib/options";
import { disciplineName, caliberName } from "@/lib/i18n-domain";
import { disciplines, type DisciplineId } from "@/lib/disciplines";
import type { Firearm } from "@/lib/models";
import { mutate } from "./mutate";
export function FirearmForm({ initial }: { initial?: Firearm }) {
  const { tr, language } = useI18n();

  const router = useJournalRouter();
  const baseline = useRef(initial ?? null);
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
  const [classSport, setClassSport] = useState<DisciplineId>("ppc");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate(
        "firearm",
        f,
        [],
        [{ kind: "firearm", id: f.id, value: baseline.current }],
      );
      router.push("/firearms/");
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
            [tr("firearm.make"), "make"],
            [tr("firearm.model"), "model"],
            [tr("firearm.group"), "group"],
            [tr("firearm.nickname"), "nickname"],
            [tr("firearm.serial"), "serial"],
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
          {tr("firearm.caliber")}
          <select
            name="caliber"
            required
            value={f.caliber}
            onChange={(e) => setF({ ...f, caliber: e.target.value })}
          >
            <option value="">{tr("firearm.selectCaliber")}</option>
            {f.caliber && !calibers.some((c) => c.value === f.caliber) && (
              <option value={f.caliber}>
                {f.caliber} {tr("common.savedPreviously")}
              </option>
            )}
            {calibers.map((c) => (
              <option key={c.value} value={c.value}>
                {caliberName(language, c.value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("firearm.type")}
          <select
            value={f.firearmType ?? "other"}
            onChange={(e) =>
              setF({
                ...f,
                firearmType: e.target.value as Firearm["firearmType"],
              })
            }
          >
            {(
              [
                "pistol",
                "revolver",
                "rifle",
                "shotgun",
                "air",
                "other",
              ] as const
            ).map((type) => (
              <option key={type} value={type}>
                {tr(`firearm.type.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={f.hasOptic ?? false}
            onChange={(e) => setF({ ...f, hasOptic: e.target.checked })}
          />
          {tr("firearm.hasOptic")}
        </label>
        <label>
          {tr("firearm.defaultSport")}
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
            <option value="">{tr("firearm.noDefaultSport")}</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {disciplineName(language, d.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">{tr("firearm.help")}</p>
      <details>
        <summary>{tr("firearm.classDefaults")}</summary>
        <p className="muted">{tr("firearm.classDefaultHelp")}</p>
        <div className="form-grid">
          <label>
            {tr("session.sport")}
            <select
              value={classSport}
              onChange={(e) => setClassSport(e.target.value as DisciplineId)}
            >
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {disciplineName(language, d.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("session.group")}
            <input
              value={f.classDefaults?.[classSport] ?? ""}
              list="firearm-class-options"
              maxLength={100}
              onChange={(e) => {
                const defaults = { ...f.classDefaults };
                if (e.target.value.trim())
                  defaults[classSport] = e.target.value;
                else delete defaults[classSport];
                setF({ ...f, classDefaults: defaults });
              }}
            />
            <datalist id="firearm-class-options">
              {classSuggestions(classSport).map((group) => (
                <option key={group} value={group}>
                  {group === "A optisk" ? tr("domain.optical") : group}
                </option>
              ))}
            </datalist>
          </label>
        </div>
      </details>
      <label>
        {tr("common.notes")}
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
        {tr("firearm.archive")}
      </label>
      {message && <p role="alert">{localizeMessage(language, message)}</p>}
      <button disabled={busy}>
        {busy ? tr("common.saving") : tr("firearm.save")} →
      </button>
    </form>
  );
}
