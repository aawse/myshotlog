"use client";
import { ensureSynchronized } from "./mutate";
import { useState } from "react";
import { Download } from "lucide-react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
export function SessionPrint({ id, date }: { id: string; date: string }) {
  const { tr } = useI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  async function download() {
    setBusy(true);
    setError(false);
    let url: string | undefined;
    try {
      await ensureSynchronized();
      const response = await fetch("/api/sessions/" + id + "/pdf/", {
        cache: "no-store",
      });
      if (
        !response.ok ||
        !response.headers.get("Content-Type")?.startsWith("application/pdf")
      )
        throw new Error("PDF_UNAVAILABLE");
      url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `myshotlog-${date}-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError(true);
    } finally {
      // Give the browser time to start the download before releasing the blob.
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={download}
      >
        {busy ? (
          <LoadingIndicator label={tr("print.preparing")} />
        ) : (
          <>
            <Download size={18} aria-hidden="true" /> {tr("print.download")}
          </>
        )}
      </button>
      {error && <p role="alert">{tr("print.error")}</p>}
    </div>
  );
}
