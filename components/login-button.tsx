"use client";
import { useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";

export function LoginButton() {
  const { tr } = useI18n();
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        submitted.current = false;
        setBusy(false);
      }
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      aria-label={busy ? tr("login.connecting") : undefined}
      onClick={() => {
        if (submitted.current) return;
        submitted.current = true;
        setBusy(true);
        window.location.assign("/auth/github/");
      }}
    >
      {busy ? (
        <LoadingIndicator label={tr("login.connecting")} />
      ) : (
        <>
          <LogIn size={18} aria-hidden="true" /> {tr("login.github")}
        </>
      )}
    </button>
  );
}
