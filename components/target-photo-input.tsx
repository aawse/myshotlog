"use client";
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
    ? "data:image/jpeg;base64," + draft.data
    : photoId
      ? "/api/photos/" + photoId
      : null;
  return (
    <div className="target-photo-input" role="group" aria-labelledby={id}>
      <span id={id} className="photo-label">
        Foto av tavlan (valfritt)
      </span>
      {source && (
        <Image
          className="target-photo-preview"
          src={source}
          alt="Foto av seriens tavla"
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
          <Camera size={18} /> Ta foto
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || disabled}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={18} /> {source ? "Byt bild" : "Välj bild"}
        </button>
        {source && (
          <button
            type="button"
            className="text-button danger"
            disabled={busy || disabled}
            onClick={() => onChange()}
          >
            <Trash2 size={16} /> Ta bort foto
          </button>
        )}
      </div>
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="photo-file-input"
        aria-label="Välj foto av tavlan"
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
        aria-label="Ta foto av tavlan"
        disabled={busy || disabled}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="muted" role="status">
        {busy
          ? "Optimerar bild…"
          : source
            ? "Bilden sparas med serien. Högst 1600 px och 180 kB i Git."
            : "Bilden förminskas och komprimeras före sparandet."}
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
