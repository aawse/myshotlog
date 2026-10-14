"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import { WitnessReviewView } from "./witness-review";
import type { WitnessReview, WitnessPhoto } from "@/lib/witness/model";
import {
  readWitnessMemory,
  writeWitnessMemory,
  type WitnessMemory,
} from "@/lib/witness/browser-memory";
export function WitnessSigning() {
  const { tr, language, setLanguage } = useI18n();
  const [token, setToken] = useState(""),
    [review, setReview] = useState<WitnessReview | null>(null),
    [photo, setPhoto] = useState<WitnessPhoto | null>(null),
    [loading, setLoading] = useState(true),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [drawn, setDrawn] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    pointer = useRef<number | null>(null);
  const [remember, setRemember] = useState(true);
  const [memoryError, setMemoryError] = useState(false);
  const remembered = useRef<WitnessMemory | null>(null);
  const canvasGeneration = useRef(0);
  useEffect(() => {
    const stored = readWitnessMemory();
    remembered.current = stored.witness;
    setRemember(stored.remember);
    if (stored.witness) setName(stored.witness.name);
  }, []);
  const initLanguage = useRef(setLanguage);
  const inviteToken = useRef("");
  const [failure, setFailure] = useState<
    "unavailable" | "error" | "drawRequired" | null
  >(null);
  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const value = fragment.get("token") ?? inviteToken.current;
    inviteToken.current = value;
    const preferredLanguage = fragment.get("lang");
    // Apply the invitation language after enclosing providers finish their mount effects.
    if (preferredLanguage === "en" || preferredLanguage === "sv")
      queueMicrotask(() => initLanguage.current(preferredLanguage));
    // Remove the bearer link from browser history after reading it. It is never persisted in storage.
    history.replaceState(history.state, "", location.pathname);
    if (!value) {
      setLoading(false);
      return;
    }
    setToken(value);
    let active = true;
    fetch("/api/witness/", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preview", token: value }),
    })
      .then(async (response) => {
        if (!response.ok) {
          if (active)
            setFailure(response.status === 410 ? "unavailable" : "error");
          return;
        }
        const data = await response.json();
        if (active) {
          setReview(data.snapshot);
          setPhoto(data.photo ?? null);
        }
      })
      .catch(() => {
        if (active) setFailure("error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function reset() {
    canvasGeneration.current += 1;
    const context = canvas.current?.getContext("2d");
    if (context) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 800, 300);
    }
    setDrawn(false);
    pointer.current = null;
  }
  useEffect(() => {
    if (!review || loading || saved) return;
    reset();
    const signature = remembered.current?.signature;
    if (!signature) return;
    const generation = canvasGeneration.current;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active || generation !== canvasGeneration.current) return;
      if (image.naturalWidth !== 800 || image.naturalHeight !== 300) {
        remembered.current = null;
        writeWitnessMemory(null);
        return;
      }
      const context = canvas.current?.getContext("2d");
      if (context) {
        context.drawImage(image, 0, 0);
        setDrawn(true);
      }
    };
    image.onerror = () => {
      if (!active || generation !== canvasGeneration.current) return;
      remembered.current = null;
      writeWitnessMemory(null);
    };
    image.src = `data:image/png;base64,${signature.data}`;
    return () => {
      active = false;
    };
  }, [review, loading, saved]);
  function position(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * 800) / rect.width,
      y: ((event.clientY - rect.top) * 300) / rect.height,
    };
  }
  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (busy || pointer.current !== null || event.button !== 0) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    canvasGeneration.current += 1;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    const point = position(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.strokeStyle = "#111";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (busy || pointer.current !== event.pointerId) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = position(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setDrawn(true);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    if (!confirmed || !drawn || !name.trim()) {
      setFailure("drawRequired");
      return;
    }
    const image = canvas.current;
    if (!image) return;
    setBusy(true);
    try {
      const witness: WitnessMemory = {
        name: name.trim(),
        signature: {
          mediaType: "image/png",
          width: 800,
          height: 300,
          data: image.toDataURL("image/png").split(",")[1],
        },
      };
      const response = await fetch("/api/witness/", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          token,
          name: witness.name,
          language,
          confirmed: true,
          signature: witness.signature,
        }),
      });
      if (!response.ok) {
        setFailure(
          response.status === 410
            ? "unavailable"
            : response.status === 400
              ? "drawRequired"
              : "error",
        );
        return;
      }
      if (remember) {
        setMemoryError(!writeWitnessMemory(witness));
        remembered.current = witness;
      }
      setSaved(true);
      setToken("");
    } catch {
      setFailure("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="witness-page">
      <header>
        <h1>{tr("witness.inviteTitle")}</h1>
        <label>
          {tr("witness.language")}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "sv")}
            disabled={busy}
          >
            <option value="sv">{tr("profile.swedish")}</option>
            <option value="en">{tr("profile.english")}</option>
          </select>
        </label>
      </header>
      {loading ? (
        <LoadingIndicator label={tr("witness.loading")} />
      ) : saved ? (
        <p role="status" className="card">
          {tr("witness.saved")}
        </p>
      ) : (
        <>
          {!token && <p>{tr("witness.noLink")}</p>}
          {review && (
            <>
              <p>{tr("witness.inviteHelp")}</p>
              <section className="card">
                <WitnessReviewView review={review} photo={photo} />
              </section>
              <form className="card witness-form" onSubmit={submit}>
                <label>
                  {tr("witness.name")}
                  <input
                    autoComplete="name"
                    maxLength={120}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="signature-label" htmlFor="witness-canvas">
                  {tr("witness.signature")}
                </label>
                <canvas
                  id="witness-canvas"
                  ref={canvas}
                  width={800}
                  height={300}
                  aria-label={tr("witness.signature")}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={() => {
                    pointer.current = null;
                  }}
                  onPointerCancel={() => {
                    pointer.current = null;
                  }}
                  onLostPointerCapture={() => {
                    pointer.current = null;
                  }}
                />
                <button
                  className="secondary"
                  type="button"
                  onClick={reset}
                  disabled={busy}
                >
                  {tr("witness.clear")}
                </button>
                <label className="witness-confirm">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    disabled={busy}
                  />
                  <span>{tr("witness.statement")}</span>
                </label>
                <p className="muted small">{tr("witness.identity")}</p>
                <button type="submit" disabled={busy || !drawn}>
                  {busy ? (
                    <LoadingIndicator label={tr("witness.saving")} />
                  ) : (
                    tr("witness.submit")
                  )}
                </button>
              </form>
            </>
          )}
          {failure && <p role="alert">{tr(`witness.${failure}`)}</p>}
        </>
      )}
      {!loading && (
        <section className="card witness-form">
          <label className="witness-confirm">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(event) => {
                const enabled = event.target.checked;
                setRemember(enabled);
                setMemoryError(false);
                if (!enabled) {
                  remembered.current = null;
                  setMemoryError(!writeWitnessMemory(null));
                }
              }}
            />
            <span>{tr("witness.remember")}</span>
          </label>
          <p className="muted small">{tr("witness.memoryHelp")}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              remembered.current = null;
              setRemember(false);
              setName("");
              reset();
              setConfirmed(false);
              setMemoryError(!writeWitnessMemory(null));
            }}
          >
            {tr("witness.forget")}
          </button>
          {memoryError && (
            <p role="status">{tr("witness.memoryUnavailable")}</p>
          )}
        </section>
      )}
    </main>
  );
}
