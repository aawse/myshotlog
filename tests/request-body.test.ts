import { it, expect, vi } from "vitest";
import { boundedBody, BodyTooLarge } from "../lib/request-body";
function streamed(chunks: Uint8Array[], headers: HeadersInit = {}) {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    cancel,
  });
  const request = new Request("https://example.test", {
    method: "POST",
    body: stream,
    headers,
    duplex: "half",
  } as RequestInit);
  return { request, cancel };
}
it("rejects an oversized Content-Length without reading the body", async () => {
  const f = streamed([], { "Content-Length": "11" });
  await expect(boundedBody(f.request, 10)).rejects.toBeInstanceOf(BodyTooLarge);
  expect(f.cancel).toHaveBeenCalledOnce();
});
it.each<HeadersInit>([
  {},
  { "Content-Length": "1" },
  { "Content-Length": "invalid" },
])(
  "bounds a stream even if Content-Length is missing or untrustworthy",
  async (headers) => {
    const f = streamed(
      [new Uint8Array(6), new Uint8Array(5), new Uint8Array(100)],
      headers,
    );
    await expect(boundedBody(f.request, 10)).rejects.toBeInstanceOf(
      BodyTooLarge,
    );
    expect(f.cancel).toHaveBeenCalledOnce();
  },
);
it("accepts the exact byte limit and decodes UTF-8 spanning chunks", async () => {
  const bytes = new TextEncoder().encode("Å🎯"),
    stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 1));
        c.enqueue(bytes.slice(1));
        c.close();
      },
    });
  expect(
    await boundedBody(
      new Request("https://example.test", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit),
      bytes.length,
    ),
  ).toBe("Å🎯");
});
