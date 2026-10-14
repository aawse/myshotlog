"use client";
import { ensureSynchronized, refreshJournal } from "./mutate";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./language-provider";
import { LoadingIndicator } from "./loading-indicator";
import { WitnessReviewView } from "./witness-review";
import type { WitnessSignoff } from "@/lib/witness/model";
type Invitation = { id: string; resultId: string | null; expiresAt: string };
export function WitnessPanel({
  sessionId,
  results,
  signoffs,
  invitations,
}: {
  sessionId: string;
  results: { id: string; label: string }[];
  signoffs: (WitnessSignoff & { current: boolean })[];
  invitations: Invitation[];
}) {
  const { tr, language, locale } = useI18n(),
    router = useRouter();
  const [scope, setScope] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const [link, setLink] = useState<{
    url: string;
    qr: string;
    invitation: Invitation;
  } | null>(null);
  async function request(action: "create" | "cancel", id?: string) {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      await ensureSynchronized();
      const response = await fetch("/api/witness/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "create"
            ? { action, sessionId, resultId: scope || null }
            : { action, id },
        ),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (action === "create") {
        const url = data.url + "&lang=" + language;
        setLink({ url, invitation: data.invitation, qr: "" });
        const QRCode = await import("qrcode");
        const qr = await QRCode.toDataURL(url, {
          width: 360,
          margin: 4,
          errorCorrectionLevel: "M",
        });
        setLink({ url, invitation: data.invitation, qr });
      } else if (id === link?.invitation.id) setLink(null);
      await refreshJournal();
      router.refresh();
    } catch {
      setError(tr("witness.error"));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link!.url);
      setCopied(true);
    } catch {
      setError(tr("witness.error"));
    }
  }
  return (
    <section className="card witness-panel">
      <h2>{tr("witness.heading")}</h2>
      <p className="muted">{tr("witness.help")}</p>
      <div className="actions">
        <label>
          {tr("details.seriesStage")}
          <select
            value={scope}
            disabled={busy}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="">{tr("witness.scopeSession")}</option>
            {results.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => request("create")}>
          {tr("witness.request")}
        </button>
      </div>
      {busy && <LoadingIndicator label={tr("common.saving")} />}
      {error && <p role="alert">{error}</p>}
      {link && (
        <div className="witness-link">
          <label>
            {tr("witness.link")}
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <p className="small muted">{tr("witness.linkHelp")}</p>
          <div className="actions">
            <button type="button" className="secondary" onClick={copy}>
              {tr("witness.copy")}
            </button>
            <a
              className="button secondary"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tr("witness.inviteTitle")}
            </a>
          </div>
          {copied && <p role="status">{tr("witness.copied")}</p>}
          {link.qr && (
            <img
              className="witness-qr"
              width={360}
              height={360}
              src={link.qr}
              alt={tr("witness.qr")}
            />
          )}
          <p>
            {tr("witness.expires", {
              time: new Date(link.invitation.expiresAt).toLocaleString(locale),
            })}
          </p>
        </div>
      )}
      {invitations.length > 0 && (
        <div>
          <h3>{tr("witness.pending")}</h3>
          {invitations.map((invite) => (
            <div className="witness-pending" key={invite.id}>
              <span>
                {invite.resultId
                  ? (results.find((r) => r.id === invite.resultId)?.label ??
                    tr("details.previousResult"))
                  : tr("witness.scopeSession")}{" "}
                · {new Date(invite.expiresAt).toLocaleString(locale)}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => request("cancel", invite.id)}
              >
                {tr("witness.cancelInvite")}
              </button>
            </div>
          ))}
        </div>
      )}
      {!signoffs.length && <p>{tr("witness.empty")}</p>}
      {signoffs.map((signoff) => (
        <article className="witness-signoff" key={signoff.id}>
          <h3>
            {tr("witness.signed", {
              name: signoff.name,
              time: new Date(signoff.signedAt).toLocaleString(locale),
            })}
          </h3>
          <p>
            {signoff.resultId
              ? signoff.snapshot.results[0].label
              : tr("witness.scopeSession")}
          </p>
          <p className={signoff.current ? "pill success" : "pill"}>
            {tr(signoff.current ? "witness.current" : "witness.changed")}
          </p>
          <img
            className="witness-signature"
            src={"data:image/png;base64," + signoff.signature.data}
            width={signoff.signature.width}
            height={signoff.signature.height}
            alt={tr("witness.signatureAlt", { name: signoff.name })}
            loading="lazy"
          />
          <p>{signoff.statement}</p>
          <details>
            <summary>{tr("witness.viewSnapshot")}</summary>
            <WitnessReviewView review={signoff.snapshot} />
          </details>
        </article>
      ))}
    </section>
  );
}
