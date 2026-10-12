"use client";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "@/components/language-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "./mutate";
export function SessionActions({ id }: { id: string }) {
  const { tr, language } = useI18n();

  const router = useRouter();
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    try {
      await mutate(action, { id });
      if (action === "delete-session") router.push("/sessions/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="actions">
      <button
        className="text-button danger"
        onClick={() => setConfirm(!confirm)}
      >
        {tr("session.delete")}
      </button>
      {confirm && (
        <span>
          {tr("session.deleteHelp")}{" "}
          <button disabled={busy} onClick={() => act("delete-session")}>
            {tr("session.confirmDelete")}
          </button>
          <button className="secondary" onClick={() => setConfirm(false)}>
            {tr("common.cancel")}
          </button>
        </span>
      )}
      {error && <p role="alert">{localizeMessage(language, error)}</p>}
    </div>
  );
}
