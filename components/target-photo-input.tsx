"use client";
import { localizeMessage } from "@/lib/i18n";
import { useI18n } from "@/components/language-provider";
import { useId, useRef, useState, useEffect } from "react";
import Image from "next/image";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { prepareTargetPhoto } from "@/lib/photos/client";
import type { PhotoDraft } from "@/lib/photos/schema";
export function TargetPhotoInput({
  photoId,
  draft,
  onChange,
  onBusyChange,
  disabled = false,
}: {
  photoId?: string;
  draft?: PhotoDraft;
  onChange: (draft?: PhotoDraft) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { tr, language } = useI18n();

  const id = useId(),
    gallery = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function choose(file?: File) {
    if (!file) return;
    const version = ++generation.current;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const photo = await prepareTargetPhoto(file);
      if (version === generation.current) onChange(photo);
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      if (version === generation.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  const source = draft
    ? "data:image/webp;base64," + draft.data
    : photoId
      ? "/api/photos/" + photoId
      : null;
  return (
    <div className="target-photo-input" role="group" aria-labelledby={id}>
      <span id={id} className="photo-label">
        {tr("photo.heading")}
      </span>
      {source && (
        <Image
          className="target-photo-preview"
          src={source}
          alt={tr("photo.alt")}
          width={320}
          height={240}
          unoptimized
        />
      )}
      <div className="photo-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy || disabled}
          onClick={() => camera.current?.click()}
        >
          <Camera size={18} /> {tr("photo.take")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || disabled}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={18} />{" "}
          {source ? tr("photo.replace") : tr("photo.choose")}
        </button>
        {source && (
          <button
            type="button"
            className="text-button danger"
            disabled={busy || disabled}
            onClick={() => onChange()}
          >
            <Trash2 size={16} /> {tr("photo.remove")}
          </button>
        )}
      </div>
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="photo-file-input"
        aria-label={tr("photo.chooseLabel")}
        disabled={busy || disabled}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="photo-file-input"
        aria-label={tr("photo.takeLabel")}
        disabled={busy || disabled}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="muted" role="status">
        {busy
          ? tr("photo.optimizing")
          : source
            ? tr("photo.saveHelp")
            : tr("photo.prepareHelp")}
      </p>
      {error && (
        <p className="notice" role="alert">
          {localizeMessage(language, error)}
        </p>
      )}
    </div>
  );
}
