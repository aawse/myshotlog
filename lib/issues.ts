import { t, type Language } from "./i18n";
export type IssueFields = {
  kind: "bug" | "feature";
  title: string;
  description: string;
  steps: string;
  expected: string;
  environment: string;
  additional: string;
};
export const issueRepository = "https://github.com/aawse/myshotlog";
const maxUrlLength = 7000;
export function issueDraft(fields: IssueFields, language: Language) {
  const title = `[${fields.kind === "bug" ? "Bug" : "Feature"}] ${fields.title.trim()}`;
  const sections = [
    [
      fields.kind === "bug" ? "issues.actual" : "issues.problem",
      fields.description,
    ],
    ...(fields.kind === "bug" ? [["issues.steps", fields.steps]] : []),
    [
      fields.kind === "bug" ? "issues.expected" : "issues.proposal",
      fields.expected,
    ],
    ["issues.environment", fields.environment],
    ["issues.additional", fields.additional],
  ] as const;
  const report =
    "# " +
    title +
    "\n\n" +
    sections
      .filter(([, value]) => value.trim())
      .map(
        ([key, value]) =>
          "## " +
          t(language, key as Parameters<typeof t>[1]) +
          "\n\n" +
          value.trim(),
      )
      .join("\n\n");
  const url = new URL(issueRepository + "/issues/new");
  url.searchParams.set("template", fields.kind + ".yml");
  url.searchParams.set("title", title);
  const values =
    fields.kind === "bug"
      ? {
          actual: fields.description,
          steps: fields.steps,
          expected: fields.expected,
          environment: fields.environment,
          additional: fields.additional,
        }
      : {
          problem: fields.description,
          proposal: fields.expected,
          environment: fields.environment,
          additional: fields.additional,
        };
  for (const [key, value] of Object.entries(values))
    if (value?.trim()) url.searchParams.set(key, value.trim());
  const needsCopy = url.href.length > maxUrlLength;
  if (needsCopy) {
    for (const key of Object.keys(values)) url.searchParams.delete(key);
    for (const key of Object.keys(values).filter((key) => key !== "additional"))
      url.searchParams.set(key, t(language, "issues.fullReportReference"));
  }
  return { url: url.href, report, needsCopy };
}
export function browserFamily(userAgent: string) {
  if (/Edg\//.test(userAgent)) return "Microsoft Edge";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "";
}
