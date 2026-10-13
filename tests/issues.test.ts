import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { issueDraft, browserFamily, type IssueFields } from "../lib/issues";
const fields: IssueFields = {
  kind: "bug",
  title: "Photos fail åäö & ?",
  description: "An error appears\nSecond line",
  steps: "1. Open\n2. Select",
  expected: "The photo loads",
  environment: "Chrome on fictional phone",
  additional: "Frequency: every attempt",
};
it("prefills bug fields on the upstream repository without token or permission parameters", () => {
  const draft = issueDraft(fields, "sv"),
    url = new URL(draft.url);
  expect(draft.needsCopy).toBe(false);
  expect(url.origin + url.pathname).toBe(
    "https://github.com/aawse/myshotlog/issues/new",
  );
  expect(url.searchParams.get("template")).toBe("bug.yml");
  expect(url.searchParams.get("title")).toBe("[Bug] " + fields.title);
  expect(url.searchParams.get("actual")).toBe(fields.description);
  expect(url.searchParams.get("steps")).toBe(fields.steps);
  expect(url.searchParams.get("expected")).toBe(fields.expected);
  for (const key of ["token", "labels", "assignees", "projects"])
    expect(url.searchParams.has(key)).toBe(false);
  expect(draft.report).toContain("## Vad hände?");
  expect(draft.report).toContain(fields.description);
});
it("maps improvement suggestions to their own issue form", () => {
  const draft = issueDraft({ ...fields, kind: "feature" }, "en"),
    url = new URL(draft.url);
  expect(url.searchParams.get("template")).toBe("feature.yml");
  expect(url.searchParams.get("problem")).toBe(fields.description);
  expect(url.searchParams.get("proposal")).toBe(fields.expected);
  expect(url.searchParams.has("steps")).toBe(false);
  expect(draft.report).not.toContain(fields.steps);
});
it.each(["bug", "feature"] as const)(
  "preserves all long %s report details while keeping the GitHub URL short",
  (kind) => {
    const description = "Lång beskrivning åäö\n".repeat(400);
    const draft = issueDraft({ ...fields, kind, description }, "sv");
    expect(draft.needsCopy).toBe(true);
    expect(draft.url.length).toBeLessThan(7000);
    expect(draft.report).toContain(description.trim());
    expect(draft.report).toContain(fields.additional);
    expect(draft.report).toContain(fields.environment);
    expect(new URL(draft.url).searchParams.has("additional")).toBe(false);
  },
);
it("uses only the explicitly supplied report fields and excludes unused properties", () => {
  const draft = issueDraft(
    {
      ...fields,
      token: "DO-NOT-SEND",
      installationUrl: "https://private.example",
      accountId: "private-account",
    } as IssueFields,
    "en",
  );
  expect(JSON.stringify(draft)).not.toMatch(
    /DO-NOT-SEND|private\.example|private-account/,
  );
});
it.each(["bug", "feature"] as const)(
  "keeps %s URL prefill names aligned with GitHub template IDs",
  (kind) => {
    const template = readFileSync(`.github/ISSUE_TEMPLATE/${kind}.yml`, "utf8");
    const ids = [...template.matchAll(/^\s+id: (\S+)$/gm)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const key of new URL(
      issueDraft({ ...fields, kind }, "en").url,
    ).searchParams.keys())
      if (!["title", "template"].includes(key)) expect(ids).toContain(key);
    expect(template).toContain("required: true");
    expect(template).toContain("security@aaw.se");
  },
);
it("uses a coarse browser family without including the full user agent", () => {
  expect(browserFamily("Mozilla Chrome/120 Safari/537 Edg/120")).toBe(
    "Microsoft Edge",
  );
  expect(browserFamily("Mozilla FxiOS/120 Safari/537")).toBe("Firefox");
  expect(browserFamily("Mozilla CriOS/120 Safari/537")).toBe("Chrome");
  expect(browserFamily("Mozilla Version/17 Safari/605")).toBe("Safari");
  expect(browserFamily("unrecognized private UA")).toBe("");
});
