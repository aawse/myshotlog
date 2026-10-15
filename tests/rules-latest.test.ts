import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  handbookDocuments,
  officialDocument,
  inspectPublishedRules,
} from "../lib/rules/latest";
import sources from "../lib/rules/sources.json";
afterEach(() => vi.unstubAllGlobals());
it("normalizes official document links and rejects unsafe or external destinations", () => {
  expect(
    officialDocument(sources.spsf.download.replace("/app/", "//app/")),
  ).toBe(sources.spsf.download);
  for (const url of [
    "http://www.pistolskytteforbundet.se/app/uploads/SHB.pdf",
    "https://evil.example/SHB.pdf",
    "https://www.pistolskytteforbundet.se@127.0.0.1/app/uploads/SHB.pdf",
    "https://www.pistolskytteforbundet.se/app/uploads/SHB.pdf?redirect=x",
    "https://www.pistolskytteforbundet.se/private/SHB.pdf",
  ])
    expect(officialDocument(url)).toBeNull();
});
it("finds a new handbook or amendments, without following unrelated PDFs", () => {
  expect(
    handbookDocuments(
      `<a href='${sources.spsf.download}'>PDF</a><a href="${sources.spsf.download}">Again</a><a href='/app/uploads/2026/Tabell.pdf'>Other</a>`,
    ),
  ).toEqual([sources.spsf.download]);
  expect(
    handbookDocuments(
      `<a href='/app/uploads/2028/SHB_2028.pdf'>New</a><a href='/app/uploads/2026/Regeländring.pdf'>Amendment</a>`,
    ),
  ).toHaveLength(2);
});
it("reports a changed link without downloading an unreviewed document", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(`<a href='/app/uploads/2028/SHB_2028.pdf'>New</a>`),
    );
  vi.stubGlobal("fetch", fetcher);
  expect((await inspectPublishedRules()).status).toBe("changed");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("checks the handbook bytes, not merely the edition in its filename", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(`<a href='${sources.spsf.download}'>PDF</a>`),
    )
    .mockResolvedValueOnce(new Response("%PDF-1.7 changed contents"));
  vi.stubGlobal("fetch", fetcher);
  expect((await inspectPublishedRules()).status).toBe("changed");
  expect(
    fetcher.mock.calls.every(([, options]) => options.redirect === "error"),
  ).toBe(true);
});
it.each(["empty", "failure", "oversized", "notPdf"])(
  "never claims the rules are current on %s responses",
  async (kind) => {
    const fetcher = vi.fn();
    if (kind === "failure") fetcher.mockRejectedValue(new Error("network"));
    else if (kind === "oversized")
      fetcher.mockResolvedValue(
        new Response("x", { headers: { "content-length": "99999999" } }),
      );
    else if (kind === "notPdf")
      fetcher
        .mockResolvedValueOnce(
          new Response(`<a href='${sources.spsf.download}'>PDF</a>`),
        )
        .mockResolvedValueOnce(new Response("<html>maintenance</html>"));
    else fetcher.mockResolvedValue(new Response("<html>no documents</html>"));
    vi.stubGlobal("fetch", fetcher);
    expect((await inspectPublishedRules()).status).toBe("unknown");
  },
);
