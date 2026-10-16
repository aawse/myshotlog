import { expect, it, vi } from "vitest";
import { createBackup, uploadBackup } from "../lib/transfer-browser";
import { exportRecords, parseImport } from "../lib/portability";
import { profile, firearm, session } from "./fixtures";
const records = {
  profile,
  firearms: [firearm],
  sessions: [session],
  assessments: [],
};
it("exports raw data from the synchronized snapshot without paginated API calls", async () => {
  const request = vi.fn<typeof fetch>();
  const blob = await createBackup(records, "json", "sv", request);
  expect(parseImport(JSON.parse(await blob.text())).sessions).toEqual([
    session,
  ]);
  expect(request).not.toHaveBeenCalled();
  expect(
    await (await createBackup(records, "csv", "en", request)).text(),
  ).toContain('"Date"');
});
it("fetches each referenced photo once, sequentially, in bounded responses", async () => {
  const id = "a".repeat(64);
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id,
      mediaType: "image/jpeg",
      width: 1,
      height: 1,
      bytes: 3,
      data: "YWJj",
    }),
  );
  const data = {
    ...records,
    sessions: [
      {
        ...session,
        results: session.results.map((r) => ({ ...r, photoId: id })),
      },
    ],
    quickEntries: [],
  };
  const blob = await createBackup(data, "json", "sv", request);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(`/api/records/?photo=${id}`, {
    cache: "no-store",
  });
  expect(JSON.parse(await blob.text()).photos).toHaveLength(1);
  request.mockResolvedValue(new Response("failure", { status: 503 }));
  await expect(createBackup(data, "json", "sv", request)).rejects.toThrow();
});
it("uploads a >3 MB backup in requests under 3 MB and finalizes only after all chunks", async () => {
  const backup = exportRecords({
    ...records,
    sessions: Array.from({ length: 700 }, (_, i) => ({
      ...session,
      id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      notes: "x".repeat(4500),
    })),
  });
  const bodies: { action: string; payload: { data?: string } }[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const text = String(init?.body);
    expect(new TextEncoder().encode(text).length).toBeLessThan(3_000_000);
    bodies.push(JSON.parse(text));
    return Response.json({ ok: true, imported: 700 });
  });
  expect((await uploadBackup(backup, request)).imported).toBe(700);
  expect(bodies[0].action).toBe("import-start");
  expect(bodies.at(-1)?.action).toBe("import-finish");
  const reconstructed = Buffer.concat(
    bodies
      .filter((b) => b.action === "import-chunk")
      .map((b) => Buffer.from(b.payload.data ?? "", "base64")),
  );
  expect(reconstructed.length).toBeGreaterThan(3_000_000);
  expect(JSON.parse(reconstructed.toString()).sessions).toHaveLength(700);
});
it("does not stage invalid backups or finalize failed uploads, and hides upstream bodies", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("private provider details", { status: 503 }),
    );
  await expect(uploadBackup({ owner: "other" }, request)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  await expect(
    uploadBackup(exportRecords(records), request),
  ).rejects.not.toThrow("private provider details");
  expect(request).toHaveBeenCalledTimes(1);
});

it("respects bounded rate-limit waits without repeating a completed upload", async () => {
  vi.useFakeTimers();
  try {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "1" } }),
      )
      .mockImplementation(async () => Response.json({ imported: 1 }));
    const pending = uploadBackup(exportRecords(records), request);
    // Hashing uses the native crypto implementation before the first request.
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await vi.runAllTimersAsync();
    expect((await pending).imported).toBe(1);
    expect(request).toHaveBeenCalledTimes(4);
  } finally {
    vi.useRealTimers();
  }
});
