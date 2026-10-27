import { expect, it } from "vitest";
import { captureWithCspEvent, isScreenshotStyle } from "./ui/csp-monitor";

it("waits for a delayed CSP event after screenshot completion", async () => {
  let deliver: () => void = () => {};
  const event = new Promise<void>((resolve) => {
    deliver = resolve;
  });
  let finished = false;
  const capture = captureWithCspEvent(async () => "image", event).then(
    (value) => {
      finished = true;
      return value;
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(finished).toBe(false);
  deliver();
  await expect(capture).resolves.toBe("image");
});

it("waits for screenshot completion when its CSP event arrives first", async () => {
  let deliver: (value: string) => void = () => {};
  const image = new Promise<string>((resolve) => {
    deliver = resolve;
  });
  let finished = false;
  const capture = captureWithCspEvent(() => image, Promise.resolve()).then(
    () => {
      finished = true;
    },
  );
  await Promise.resolve();
  expect(finished).toBe(false);
  deliver("image");
  await capture;
  expect(finished).toBe(true);
});

it("propagates capture and CSP observation failures", async () => {
  await expect(
    captureWithCspEvent(async () => {
      throw new Error("capture");
    }, Promise.resolve()),
  ).rejects.toThrow("capture");
  await expect(
    captureWithCspEvent(
      async () => "image",
      Promise.reject(new Error("event")),
    ),
  ).rejects.toThrow("event");
});

it("recognizes only the known screenshot tooling style", () => {
  const known = {
    directive: "style-src-elem",
    source: "",
    line: 5,
    blocked: "inline",
  };
  expect(isScreenshotStyle(known)).toBe(true);
  for (const changed of [
    { directive: "script-src" },
    { source: "https://example.test/app.js" },
    { line: 6 },
    { blocked: "https://example.test/style.css" },
  ])
    expect(isScreenshotStyle({ ...known, ...changed })).toBe(false);
});
