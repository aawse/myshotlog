import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import baseline from "../lib/rules/update-baseline.json" with { type: "json" };
import {
  documentUrl,
  downloadUrl,
  discover,
  inspectSource,
  differences,
  checkSources,
  issueDetails,
  ensureIssue,
} from "../scripts/check-rule-updates.mjs";

const spsf = baseline.sources.find((source) => source.id === "spsf");
const ipsc = baseline.sources.find((source) => source.id === "ipsc");
const doc = spsf.documents.find((document) => document.url.includes("SHB_"));
const source = { ...spsf, documents: [doc] };
const html = `<a href="${doc.url}">Handbook</a>`;
const pdf = "%PDF-1.7 public rulebook";
const fingerprint = createHash("sha256").update(pdf).digest("hex");
const report = {
  changes: [
    {
      name: "SPSF",
      page: source.page,
      changes: [
        {
          kind: "content changed",
          url: doc.url,
          label: "Handbook",
          sha256: fingerprint,
          previousSha256: doc.sha256,
        },
      ],
    },
  ],
  failures: [],
};

it("covers every official rules publisher and all IPSC discipline families", () => {
  expect(baseline.sources.map((item) => item.id).sort()).toEqual([
    "ipsc",
    "sdssf",
    "spsf",
    "sra",
  ]);
  for (const item of baseline.sources) {
    expect(item.documents.length).toBeGreaterThanOrEqual(item.minimumDocuments);
    expect(new Set(item.documents.map((entry) => entry.url)).size).toBe(
      item.documents.length,
    );
    for (const entry of item.documents) {
      expect(documentUrl(entry.url, item.page)).toBe(entry.url);
      if (item.mode === "pdf") expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  }
  for (const name of [
    "Handgun",
    ".22LR Handgun",
    "Shotgun",
    "Rifle",
    "Mini-Rifle",
    "Pistol Caliber Carbine",
    "Action Air Handgun",
    "Action Air Rifle",
    "Action Air Pistol Caliber Carbine",
    "Combined",
    "Interpretations",
  ])
    expect(ipsc.documents.some((entry) => entry.label.includes(name))).toBe(
      true,
    );
});
it("normalizes links but rejects unexpected hosts, credentials, queries and protocols", () => {
  expect(documentUrl(doc.url.replace("/app/", "//app/"), source.page)).toBe(
    doc.url,
  );
  for (const url of [
    "http://example.com/rules.pdf",
    "https://127.0.0.1/rules.pdf",
    "https://evil.example/rules.pdf",
    "https://user@www.pistolskytteforbundet.se/rules.pdf",
    doc.url + "?redirect=evil",
    "https://drive.google.com/evil",
    "javascript:alert(1)",
  ])
    expect(documentUrl(url, source.page)).toBeNull();
  expect(
    documentUrl(
      "https://drive.google.com/file/d/ABC-123/view?usp=drive_link",
      ipsc.page,
    ),
  ).toBe("https://drive.google.com/file/d/ABC-123/view");
});
it("ignores unrelated documents and deduplicates handbook links", () => {
  expect(
    discover(
      source,
      html + html + '<a href="/app/uploads/members.pdf">Member list</a>',
    ),
  ).toEqual([{ url: doc.url, label: "Handbook" }]);
  expect(() => discover(source, "<html>Maintenance</html>")).toThrow(
    "inventory",
  );
});
it("finds new supplements and handles relative links and entity-encoded URLs", () => {
  const result = discover(
    source,
    html + '<a href="/app/uploads/2028/regeländring.pdf">Rättelse</a>',
  );
  expect(result).toHaveLength(2);
  expect(result.some((entry) => entry.label === "Rättelse")).toBe(true);
});
it("limits IPSC discovery to original rulebooks and interpretations, excluding translations", () => {
  const rules = baseline.sources.find((item) => item.id === "ipsc");
  const content =
    "<h1>IPSC RULE BOOKS</h1>" +
    rules.documents
      .map((entry) =>
        `<a href="${entry.url}?usp=drive_link">${entry.label}</a>`.replace(
          ".pdf?usp=drive_link",
          ".pdf",
        ),
      )
      .join("") +
    '<h3>TRANSLATIONS</h3><a href="https://drive.google.com/file/d/finnish/view">Finnish Handgun</a>';
  expect(discover(rules, content)).toHaveLength(rules.documents.length);
  expect(() => discover(rules, "<html>Access denied</html>")).toThrow(
    "section",
  );
});
it("hashes actual PDF bytes and reports same-URL replacements", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(html))
    .mockResolvedValueOnce(new Response(pdf));
  const documents = await inspectSource(source, fetcher);
  expect(documents[0].sha256).toBe(fingerprint);
  expect(differences(source.documents, documents)[0].kind).toBe(
    "content changed",
  );
  for (const [, options] of fetcher.mock.calls) {
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBeUndefined();
  }
});
it("detects additions and removals without treating cosmetic labels as updates", () => {
  expect(differences([doc], [{ ...doc, label: "Different case" }])).toEqual([]);
  expect(
    differences([doc], [{ url: "https://example.com/new.pdf", label: "New" }])
      .map((entry) => entry.kind)
      .sort(),
  ).toEqual(["added", "removed"]);
});
it.each([
  [new Response("Blocked", { status: 403 }), "HTTP 403"],
  [new Response("Login page"), "not a PDF"],
  [
    new Response(pdf, {
      headers: { "content-length": String(26 * 1024 * 1024) },
    }),
    "size limit",
  ],
])(
  "fails closed for blocked, non-PDF and oversized documents",
  async (response, message) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(response);
    await expect(inspectSource(source, fetcher)).rejects.toThrow(message);
  },
);
it("bounds streamed responses even when content-length is absent", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("x".repeat(2 * 1024 * 1024 + 1)));
  await expect(inspectSource(source, fetcher)).rejects.toThrow("size limit");
});
it("keeps verified changes when another publisher fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(html))
    .mockResolvedValueOnce(new Response(pdf))
    .mockRejectedValueOnce(new Error("timeout"));
  const result = await checkSources(
    { sources: [source, { ...source, name: "Unavailable publisher" }] },
    fetcher,
  );
  expect(result.changes).toHaveLength(1);
  expect(result.failures).toEqual([
    { name: "Unavailable publisher", page: source.page, error: "timeout" },
  ]);
});
it("explains safe update steps and deduplicates independently of errors and link labels", () => {
  const details = issueDetails(report);
  expect(details.body).toContain("Preserve old versions");
  expect(details.body).toContain("--write-baseline");
  expect(details.body).toContain("including public Google Drive files");
  const changedLabel = structuredClone(report);
  changedLabel.changes[0].changes[0].label = "@everyone <script>hi</script>";
  changedLabel.failures = [
    { name: "IPSC", page: ipsc.page, error: "HTTP 403" },
  ];
  expect(issueDetails(changedLabel).marker).toBe(details.marker);
  expect(issueDetails(changedLabel).body).not.toContain("@everyone");
});
it.each(["open", "closed"])(
  "does not recreate an existing %s issue",
  async (state) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { number: 7, state, body: issueDetails(report).marker },
          ]),
        ),
      );
    await expect(
      ensureIssue(report, {
        repository: "owner/fork",
        token: "test-only",
        fetcher,
      }),
    ).resolves.toEqual({ created: false, number: 7 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it("paginates past pull requests and creates an issue in this repository only", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          Array.from({ length: 100 }, () => ({
            pull_request: {},
            body: issueDetails(report).marker,
          })),
        ),
      ),
    )
    .mockResolvedValueOnce(new Response("[]"))
    .mockResolvedValueOnce(new Response('{"number":12}'));
  await expect(
    ensureIssue(report, {
      repository: "owner/fork",
      token: "test-only",
      fetcher,
    }),
  ).resolves.toEqual({ created: true, number: 12 });
  expect(fetcher.mock.calls[1][0]).toContain("page=2");
  const [url, options] = fetcher.mock.calls[2];
  expect(url).toBe("https://api.github.com/repos/owner/fork/issues");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body).body).toContain(issueDetails(report).marker);
});
it("fails without creating duplicates if listing issues fails or is incomplete", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("forbidden", { status: 403 }));
  await expect(
    ensureIssue(report, {
      repository: "owner/fork",
      token: "test-only",
      fetcher,
    }),
  ).rejects.toThrow("HTTP 403");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const full = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            Array.from({ length: 100 }, () => ({ body: "other" })),
          ),
        ),
      ),
    );
  await expect(
    ensureIssue(report, {
      repository: "owner/fork",
      token: "test-only",
      fetcher: full,
    }),
  ).rejects.toThrow("search limit");
  expect(full).toHaveBeenCalledTimes(20);
});
it("uses a six-month schedule, manual dispatch, Ubuntu and the built-in token", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/rule-updates.yml", import.meta.url),
    "utf8",
  );
  expect(workflow).toContain('cron: "23 7 5 1,7 *"');
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("ubuntu-latest");
  expect(workflow).toContain("issues: write");
  expect(workflow).toContain("${{ github.token }}");
  expect(workflow).not.toContain("pull_request_target");
});

it("fingerprints Drive PDF bytes through a fixed public endpoint without redirects", async () => {
  const entry = ipsc.documents.find((item) =>
    item.url.includes("drive.google.com"),
  );
  expect(downloadUrl(entry.url)).toMatch(
    /^https:\/\/drive\.usercontent\.google\.com\/download\?id=[\w-]+&export=download$/,
  );
  expect(downloadUrl(doc.url)).toBe(doc.url);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        `<h1>IPSC RULE BOOKS</h1><a href="${entry.url}">Handgun</a>`,
      ),
    )
    .mockResolvedValueOnce(new Response(pdf));
  const result = await inspectSource({ ...ipsc, minimumDocuments: 1 }, fetcher);
  expect(result[0].sha256).toBe(fingerprint);
  expect(fetcher.mock.calls[1][0]).toBe(downloadUrl(entry.url));
  expect(fetcher.mock.calls[1][1].redirect).toBe("error");
});
