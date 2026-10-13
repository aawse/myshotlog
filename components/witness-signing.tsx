"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import { WitnessReviewView } from "./witness-review";
import type { WitnessReview } from "@/lib/witness/model";
export function WitnessSigning() {
  const { tr, language, setLanguage } = useI18n();
  const [token, setToken] = useState(""),
    [review, setReview] = useState<WitnessReview | null>(null),
    [loading, setLoading] = useState(true),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [drawn, setDrawn] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    pointer = useRef<number | null>(null);
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
        if (active) setReview(data.snapshot);
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
    const context = canvas.current?.getContext("2d");
    if (context) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 800, 300);
    }
    setDrawn(false);
    pointer.current = null;
  }
  useEffect(() => {
    if (review) reset();
  }, [review]);
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
    if (pointer.current !== event.pointerId) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = position(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setDrawn(true);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    if (!confirmed || !drawn || !name.trim()) {
      setFailure("drawRequired");
      return;
    }
    const image = canvas.current;
    if (!image) return;
    setBusy(true);
    try {
      const response = await fetch("/api/witness/", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          token,
          name: name.trim(),
          language,
          confirmed: true,
          signature: {
            mediaType: "image/png",
            width: 800,
            height: 300,
            data: image.toDataURL("image/png").split(",")[1],
          },
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
                <WitnessReviewView review={review} />
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
    </main>
  );
}
