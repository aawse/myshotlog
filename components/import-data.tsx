"use client";
import { useRef, useState } from "react";
import { useJournalRouter } from "./journal-navigation";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import { mutate } from "./mutate";
export function ImportData({
  disabled = false,
  onBusyChange,
  returnToDashboard = false,
}: {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  returnToDashboard?: boolean;
}) {
  const { tr, language } = useI18n();
  const router = useJournalRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const importing = useRef(false);
  return (
    <div className="form">
      <label>
        {tr("profile.importJson")}
        <input
          type="file"
          accept="application/json,.json"
          disabled={disabled || busy}
          onChange={async (event) => {
            const input = event.currentTarget,
              file = input.files?.[0];
            if (!file || disabled || importing.current) return;
            importing.current = true;
            setBusy(true);
            onBusyChange?.(true);
            setMessage("");
            setFailed(false);
            try {
              if (file.size > 3000000)
                throw new Error(tr("profile.fileTooLarge"));
              let payload: unknown;
              try {
                payload = JSON.parse(await file.text());
              } catch {
                throw new Error(tr("profile.invalidJson"));
              }
              const receipt = await mutate("import", payload);
              setMessage(tr("profile.imported", { p0: receipt.imported }));
              if (returnToDashboard) router.replace("/dashboard/");
              router.refresh();
            } catch (error) {
              setFailed(true);
              setMessage(localizeMessage(language, (error as Error).message));
            } finally {
              input.value = "";
              importing.current = false;
              setBusy(false);
              onBusyChange?.(false);
            }
          }}
        />
      </label>
      {busy && <LoadingIndicator label={tr("common.saving")} />}
      {message && (
        <p className="notice" role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
      <p className="muted">{tr("profile.importHelp")}</p>
    </div>
  );
}
