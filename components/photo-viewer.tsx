"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
export function PhotoViewer({
  src,
  label,
  preview = false,
}: {
  src: string;
  label: string;
  preview?: boolean;
}) {
  const { tr } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    if (!modal) return;
    modal.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (modal.open) modal.close();
      document.body.style.overflow = overflow;
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="photo-thumbnail"
        aria-label={tr("details.openPhotoPrefix") + label}
        onClick={() => {
          setStatus("loading");
          setOpen(true);
        }}
      >
        <Image
          src={src}
          alt={tr("details.photoAlt")}
          className={preview ? "target-photo-preview" : "series-target-photo"}
          width={preview ? 320 : 120}
          height={preview ? 240 : 90}
          unoptimized
        />
      </button>
      <dialog
        ref={dialog}
        className="photo-overlay"
        aria-label={tr("details.photoAlt") + ": " + label}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="photo-overlay-content">
          <header className="photo-overlay-header">
            <strong>{label}</strong>
            <button
              type="button"
              className="secondary"
              autoFocus
              aria-label={tr("common.close")}
              onClick={() => dialog.current?.close()}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="photo-overlay-image">
            {open && status !== "error" && (
              <img
                key={attempt}
                src={src}
                alt={tr("details.photoAlt")}
                className={
                  status === "loaded"
                    ? "photo-full"
                    : "photo-full photo-pending"
                }
                onLoad={() => setStatus("loaded")}
                onError={() => setStatus("error")}
              />
            )}
            {open && status === "loading" && (
              <LoadingIndicator label={tr("photo.loading")} />
            )}
            {open && status === "error" && (
              <div className="form">
                <p role="alert">{tr("photo.loadFailed")}</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus("loading");
                    setAttempt((a) => a + 1);
                  }}
                >
                  {tr("error.retry")}
                </button>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
