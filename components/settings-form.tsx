"use client";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "./language-provider";
import { useRef, useState } from "react";
import { useJournalRouter } from "./journal-navigation";
import { todayInTimezone, type Profile } from "@/lib/models";
import { useJournal } from "./journal-provider";
import { LoadingIndicator } from "./loading-indicator";
import { ImportData } from "./import-data";
import { mutate, ensureSynchronized } from "./mutate";
export function SettingsForm({ profile }: { profile: Profile }) {
  const { tr, language, setLanguage } = useI18n();
  const [p, setP] = useState(profile),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState("");
  const router = useJournalRouter();
  const journal = useJournal();
  const [exporting, setExporting] = useState(false);
  const baseline = useRef(profile);
  async function act(action: string, payload: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await mutate(
        action,
        payload,
        [],
        action === "profile"
          ? [{ kind: "profile", id: null, value: baseline.current }]
          : [],
      );
      if (action === "profile") baseline.current = p;
      if (action === "profile") setLanguage(p.language);
      setMessage(tr("profile.saved"));
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(format: "json" | "csv") {
    if (busy) return;
    setBusy(true);
    setExporting(true);
    setMessage("");
    try {
      await ensureSynchronized();
      const data = journal?.getSnapshot().records;
      if (!data) throw new Error(tr("profile.exportFailed"));
      const { createBackup } = await import("@/lib/transfer-browser");
      const blob = await createBackup(data, format, language);
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = format === "json" ? "myshotlog-v2.json" : "myshotlog.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(tr("profile.exportReady"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setExporting(false);
    }
  }
  return (
    <div className="form settings-sections">
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          act("profile", p);
        }}
      >
        <h2>{tr("profile.heading")}</h2>
        <div className="form-grid">
          <label>
            {tr("profile.displayName")}
            <input
              value={p.displayName}
              maxLength={100}
              onChange={(e) => setP({ ...p, displayName: e.target.value })}
            />
          </label>
          <label>
            {tr("profile.birthDate")}
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
            {tr("profile.language")}
            <select
              aria-label={tr("profile.language")}
              value={p.language}
              onChange={(e) =>
                setP({ ...p, language: e.target.value as "sv" | "en" })
              }
            >
              <option value="sv">{tr("profile.swedish")}</option>
              <option value="en">{tr("profile.english")}</option>
            </select>
          </label>
          <label>
            {tr("profile.timezone")}
            <input
              value={p.timezone}
              onChange={(e) => setP({ ...p, timezone: e.target.value })}
            />
          </label>
        </div>
        <p className="muted">{tr("profile.ageHelp")}</p>
        {!p.birthDate && p.birthYear !== null && (
          <p className="muted">
            {tr("profile.previousBirthYear")} {p.birthYear}
            {tr("profile.birthYearHelp")}
          </p>
        )}
        <div className="actions">
          <button disabled={busy}>{tr("profile.save")}</button>
          <button
            type="button"
            className="secondary"
            disabled={busy || (!p.birthDate && p.birthYear === null)}
            onClick={() => setP({ ...p, birthDate: null, birthYear: null })}
          >
            {tr("profile.clearBirth")}
          </button>
        </div>
      </form>
      <section className="card">
        <h2>{tr("profile.dataHeading")}</h2>
        <p>{tr("profile.exportHelp")}</p>
        <div className="actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => download("json")}
          >
            {tr("profile.exportJson")}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => download("csv")}
          >
            {tr("profile.exportCsv")}
          </button>
        </div>
        {exporting && (
          <LoadingIndicator label={tr("profile.preparingExport")} />
        )}
        <ImportData disabled={busy} onBusyChange={setBusy} />
      </section>
      <section className="card">
        <h2>{tr("profile.deleteHeading")}</h2>
        <p>{tr("profile.deleteHelp")}</p>
        <label>
          {tr("profile.confirmDelete")}
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button
          className="danger-button"
          disabled={busy || confirm !== "RADERA"}
          onClick={() => act("delete-records", { confirm })}
        >
          {tr("profile.delete")}
        </button>
        <p className="muted">{tr("profile.closeHelp")}</p>
      </section>
      {message && (
        <p className="notice" role="status">
          {localizeMessage(language, message)}
        </p>
      )}
    </div>
  );
}
