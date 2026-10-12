"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "./mutate";
export function SessionActions({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    try {
      await mutate(action, { id });
      if (action === "delete-session") router.push("/sessions");
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
        Radera pass
      </button>
      {confirm && (
        <span>
          Ta bort pass och bedömningar från aktuell journal? Git-historiken
          finns kvar.{" "}
          <button disabled={busy} onClick={() => act("delete-session")}>
            Ja, radera
          </button>
          <button className="secondary" onClick={() => setConfirm(false)}>
            Avbryt
          </button>
        </span>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
