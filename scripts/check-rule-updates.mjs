import { createHash } from "node:crypto";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const baselineFile = new URL(
  "../lib/rules/update-baseline.json",
  import.meta.url,
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const decode = (value) =>
  value
    .replace(/&amp;|&#0*38;|&#x0*26;/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
const text = (value) =>
  decode(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
const safeText = (value) =>
  value
    .replace(/[<>&`\[\]!*_]/g, "")
    .replace(/@/g, "＠")
    .slice(0, 200);

export function documentUrl(value, page) {
  const url = new URL(decode(value), page);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.hostname === "drive.google.com") {
    const id = /^\/file\/d\/([\w-]+)\/view$/.exec(url.pathname)?.[1];
    return id ? `https://drive.google.com/file/d/${id}/view` : null;
  }
  if (url.hostname !== new URL(page).hostname || !/\.pdf$/i.test(url.pathname))
    return null;
  if (url.search) return null;
  return url.href;
}

export function discover(source, html) {
  // Only rule documents, never page HTML, banners, member lists or unrelated policies.
  if (source.id === "ipsc") {
    const start = />\s*IPSC RULE BOOKS\s*</i.exec(html);
    if (!start) throw new Error("Rule-book section not found");
    html = html.slice(start.index).split(/>\s*TRANSLATIONS\s*</i)[0];
  }
  const found = new Map();
  for (const anchor of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    let url;
    try {
      url = documentUrl(anchor[1], source.page);
    } catch {
      continue;
    }
    if (!url) continue;
    const label = text(anchor[2]);
    const match = `${decodeURIComponent(url)} ${label}`;
    const relevant = {
      spsf: /shb|skjuthandbok|komplettering|rättelse|regeländring|vapenlista.*ssa/i,
      sra: /sra.*(?:regel|rule)|regelverk|komplettering|rättelse/i,
      ipsc: /handgun|shotgun|rifle|carbine|tournament|combined|interpretation|chronograph|equipment/i,
      sdssf:
        /regler|rules|handgun|nordic|dmr|skjutskicklighet|märkes|markes|komplettering|tolkning/i,
    }[source.id];
    if (relevant?.test(match))
      found.set(url, {
        url,
        label: label || new URL(url).pathname.split("/").at(-1),
      });
  }
  const documents = [...found.values()].sort((a, b) =>
    a.url.localeCompare(b.url, "en"),
  );
  if (documents.length < source.minimumDocuments || documents.length > 100)
    throw new Error(
      "Unexpected rule document inventory; inspect the official page manually",
    );
  return documents;
}

async function boundedFetch(url, limit, fetcher) {
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(45000),
    headers: {
      "User-Agent": "MyShotLog-rule-monitor/1.0",
      Accept: "text/html, application/pdf",
    },
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Source exceeds size limit");
  const chunks = [];
  let size = 0;
  if (!response.body) throw new Error("Empty response");
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Source exceeds size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export function downloadUrl(url) {
  const id = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/view$/.exec(
    url,
  )?.[1];
  // Fixed public file endpoint: do not follow Drive redirects or fetch its changing preview UI.
  return id
    ? `https://drive.usercontent.google.com/download?id=${id}&export=download`
    : url;
}

export async function inspectSource(source, fetcher = fetch) {
  const html = await boundedFetch(source.page, 2 * 1024 * 1024, fetcher);
  const documents = discover(source, html.toString("utf8"));
  if (source.mode !== "pdf") throw new Error("Unsupported source check mode");
  // Keep requests modest while avoiding serial downloads of every IPSC discipline.
  for (let index = 0; index < documents.length; index += 3) {
    const results = await Promise.allSettled(
      documents.slice(index, index + 3).map(async (doc) => {
        const bytes = await boundedFetch(
          downloadUrl(doc.url),
          25 * 1024 * 1024,
          fetcher,
        );
        if (bytes.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("Document is not a PDF");
        doc.sha256 = hash(bytes);
      }),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }
  return documents;
}

export function differences(before, after) {
  const old = new Map(before.map((doc) => [doc.url, doc]));
  const now = new Map(after.map((doc) => [doc.url, doc]));
  return [
    ...after
      .filter((doc) => !old.has(doc.url))
      .map((doc) => ({ kind: "added", ...doc })),
    ...before
      .filter((doc) => !now.has(doc.url))
      .map((doc) => ({ kind: "removed", ...doc })),
    ...after
      .filter(
        (doc) => old.has(doc.url) && doc.sha256 !== old.get(doc.url).sha256,
      )
      .map((doc) => ({
        kind: "content changed",
        ...doc,
        previousSha256: old.get(doc.url).sha256,
      })),
  ].sort((a, b) => a.url.localeCompare(b.url, "en"));
}

export async function checkSources(baseline, fetcher = fetch) {
  const report = { changes: [], failures: [], sources: [] };
  // Isolate failures so one blocked publisher cannot hide another publisher's update.
  for (const source of baseline.sources) {
    try {
      const documents = await inspectSource(source, fetcher);
      report.sources.push({ ...source, documents });
      const changes = differences(source.documents, documents);
      if (changes.length)
        report.changes.push({ name: source.name, page: source.page, changes });
    } catch (error) {
      report.failures.push({
        name: source.name,
        page: source.page,
        error: error.message,
      });
    }
  }
  return report;
}

export function issueDetails(report) {
  const fingerprint = hash(
    JSON.stringify(
      report.changes.map((source) => ({
        page: source.page,
        changes: source.changes.map(
          ({ kind, url, sha256, previousSha256 }) => ({
            kind,
            url,
            sha256,
            previousSha256,
          }),
        ),
      })),
    ),
  );
  const marker = `<!-- myshotlog-rule-update:${fingerprint} -->`;
  const body = [
    marker,
    "Official rule documents have changed since the reviewed baseline. This is a request for review, not a confirmed change to scoring rules.",
    ...report.changes.flatMap((source) => [
      `### ${safeText(source.name)}`,
      `Official source: ${source.page}`,
      ...source.changes.map(
        (doc) =>
          `- **${doc.kind}**: ${safeText(doc.label)} — ${doc.url}${doc.sha256 ? `\n  SHA-256: \`${doc.previousSha256 ? `${doc.previousSha256} → ` : ""}${doc.sha256}\`` : ""}`,
      ),
    ]),
    "### Update checklist",
    "- [ ] Read the new official documents, amendments and effective dates. A changed file can be a publishing correction rather than a scoring change.",
    "- [ ] Review `lib/events/programs.json` and `lib/events/programs.ts` for affected events, classes, distances, stages and timings. Update tests and references as needed.",
    "- [ ] If automatic evaluations change, add a dated version with a new ID in `lib/rules/versions.json`; extend the evaluator if needed. Preserve old versions, recorded evaluations, witness snapshots and captured birth-date inputs. Never reassess past records automatically.",
    "- [ ] Update `lib/rules/sources.json`, rule download links, `docs/RULES.md` and `docs/EVENTS.md`. Synchronize the public website's rule links, documentation and demo catalog if affected.",
    "- [ ] Run `npm run rules:sync`, `npm test`, `npm run typecheck`, `npm run format:check` and `npm run build`. Check affected forms and public website changes.",
    "- [ ] After reviewing every changed document, run `node scripts/check-rule-updates.mjs --write-baseline` locally. Review the baseline diff and commit it with the rule changes. Never acknowledge an update merely to silence this issue.",
    "Details and coverage: `docs/RULES.md`. Custom events have no federation rule source. All monitored sources compare published document links and PDF SHA-256 hashes, including public Google Drive files linked by IPSC.",
    ...(report.failures.length
      ? [
          "### Sources that could not be verified",
          ...report.failures.map(
            (source) =>
              `- ${safeText(source.name)}: ${safeText(source.error)}. Check ${source.page} manually.`,
          ),
        ]
      : []),
  ].join("\n\n");
  return { title: "Review updated shooting rule documents", body, marker };
}

export async function ensureIssue(
  report,
  { repository, token, fetcher = fetch },
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !token)
    throw new Error(
      "GITHUB_REPOSITORY and GITHUB_TOKEN are required for --issue",
    );
  const details = issueDetails(report);
  const api = async (path, method = "GET", body) => {
    const response = await fetcher(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub issue request failed (HTTP ${response.status}); check Issues are enabled and workflow issues:write permission`,
      );
    return response.json();
  };
  // Include closed issues: closing an acknowledged report must not recreate it on the next run.
  for (let page = 1; page <= 20; page++) {
    const issues = await api(`issues?state=all&per_page=100&page=${page}`);
    if (!Array.isArray(issues)) throw new Error("Invalid GitHub issue list");
    const existing = issues.find(
      (issue) => !issue.pull_request && issue.body?.includes(details.marker),
    );
    if (existing) return { created: false, number: existing.number };
    if (issues.length < 100) {
      const created = await api("issues", "POST", {
        title: details.title,
        body: details.body,
      });
      return { created: true, number: created.number };
    }
  }
  throw new Error(
    "Issue search limit reached; refusing to create a possible duplicate",
  );
}

export async function main(args = process.argv.slice(2)) {
  if (
    args.some((arg) => !["--issue", "--write-baseline"].includes(arg)) ||
    args.length > 1
  )
    throw new Error(
      "Usage: node scripts/check-rule-updates.mjs [--issue | --write-baseline]",
    );
  const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
  const report = await checkSources(baseline);
  const summary = [
    "## Rule source check",
    `Changed sources: ${report.changes.length}. Unverified sources: ${report.failures.length}.`,
    ...baseline.sources.map(
      (source) =>
        `- ${source.name}: ${report.failures.some((f) => f.name === source.name) ? "could not verify" : report.changes.some((c) => c.name === source.name) ? "documents changed" : "no change detected"} (${source.mode === "pdf" ? "links and PDF hashes" : "published links only"})`,
    ),
    ...report.failures.map(
      (source) => `- ${safeText(source.name)}: ${safeText(source.error)}`,
    ),
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (args.includes("--write-baseline")) {
    if (report.failures.length)
      throw new Error(
        "Baseline unchanged: every source must be verified before recording a new baseline",
      );
    await writeFile(
      baselineFile,
      JSON.stringify(
        {
          reviewedAt: new Date().toISOString().slice(0, 10),
          sources: report.sources,
        },
        null,
        2,
      ) + "\n",
    );
  } else if (args.includes("--issue") && report.changes.length) {
    const result = await ensureIssue(report, {
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
    });
    console.log(
      `${result.created ? "Created" : "Already reported in"} issue #${result.number}`,
    );
  } else if (report.changes.length) console.log(issueDetails(report).body);
  if (report.failures.length)
    throw new Error(
      "Some official sources could not be verified; see the run summary. This does not mean the rules are current.",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
