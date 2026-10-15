import "server-only";
import { createHash } from "node:crypto";
import sources from "./sources.json";
export type RulesStatus = {
  status: "current" | "changed" | "unknown";
  checkedAt: string;
  documentUrl?: string;
};
const host = new URL(sources.spsf.sourcePage).hostname;
// Do not fetch arbitrary page links, redirects, user-supplied URLs or private addresses.
export function officialDocument(value: string) {
  try {
    const url = new URL(
      value.replaceAll("&amp;", "&"),
      sources.spsf.sourcePage,
    );
    if (
      url.protocol !== "https:" ||
      url.hostname !== host ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (
      !url.pathname.startsWith("/app/uploads/") ||
      !/\.pdf$/i.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function handbookDocuments(html: string) {
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap(
    (match) => {
      const url = officialDocument(match[1]);
      if (!url) return [];
      const name = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!);
      return /(?:shb|skjuthandbok|komplettering|r[aä]ttelse|regel[aä]ndring)/i.test(
        name,
      )
        ? [url]
        : [];
    },
  );
  return [...new Set(links)].sort();
}
async function bounded(url: string, limit: number, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    redirect: "error",
    cache: "no-store",
    headers: { Accept: url.endsWith(".pdf") ? "application/pdf" : "text/html" },
  });
  if (!response.ok || !response.body) throw new Error("unavailable");
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("size");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("size");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function inspectPublishedRules(): Promise<RulesStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const checkedAt = new Date().toISOString();
  try {
    const page = await bounded(
      sources.spsf.sourcePage,
      1024 * 1024,
      controller.signal,
    );
    const documents = handbookDocuments(page.toString("utf8"));
    if (!documents.length) return { status: "unknown", checkedAt };
    if (documents.length !== 1 || documents[0] !== sources.spsf.download)
      return { status: "changed", checkedAt, documentUrl: documents.at(-1) };
    const pdf = await bounded(
      documents[0],
      20 * 1024 * 1024,
      controller.signal,
    );
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("notPdf");
    const status =
      createHash("sha256").update(pdf).digest("hex") === sources.spsf.sha256
        ? "current"
        : "changed";
    return { status, checkedAt, documentUrl: documents[0] };
  } catch {
    return { status: "unknown", checkedAt };
  } finally {
    clearTimeout(timer);
  }
}
let cache: { value: RulesStatus; until: number } | undefined;
let pending: Promise<RulesStatus> | undefined;
export function latestRules() {
  if (cache && cache.until > Date.now()) return Promise.resolve(cache.value);
  if (pending) return pending;
  pending = inspectPublishedRules()
    .then((value) => {
      cache = {
        value,
        until:
          Date.now() +
          (value.status === "unknown" ? 60000 : 6 * 60 * 60 * 1000),
      };
      return value;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
