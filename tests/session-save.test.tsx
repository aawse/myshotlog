import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  stateIndex: 0,
  refIndex: 0,
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.values))
      hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] =
          typeof value === "function" ? value(hooks.values[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) =>
    hooks.refs[hooks.refIndex++] ??
    (hooks.refs[hooks.refIndex - 1] = { current: initial }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../components/language-provider", async () => {
  const { translator } = await import("../lib/i18n");
  return { useI18n: () => translator("sv") };
});
vi.mock("../components/mutate", () => ({ mutate: vi.fn() }));
import { mutate } from "../components/mutate";
import { SessionForm } from "../components/session-form";
import { LoadingIndicator } from "../components/loading-indicator";
import { session, firearm } from "./fixtures";
beforeEach(() => {
  hooks.values = [];
  hooks.refs = [];
  vi.clearAllMocks();
});
function form(initial?: typeof session) {
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  return SessionForm({ firearms: [firearm], initial });
}
const event = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;
function children(element: ReturnType<typeof form>) {
  return element.props.children.filter(Boolean) as ReactElement<{
    disabled?: boolean;
    role?: string;
    label?: string;
  }>[];
}
it.each([undefined, session])(
  "shows progress until a new or edited session is saved, then returns to the list",
  async (initial) => {
    let complete!: () => void;
    vi.mocked(mutate).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = () => resolve({ ok: true });
        }),
    );
    const rendered = form(initial),
      pending = rendered.props.onSubmit(event());
    await rendered.props.onSubmit(event());
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(children(form(initial)).at(-1)?.props.disabled).toBe(true);
    expect(
      children(form(initial)).some((child) => child.type === LoadingIndicator),
    ).toBe(true);
    complete();
    await pending;
    expect(router.replace).toHaveBeenCalledWith("/sessions/");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(children(form(initial)).at(-1)?.props.disabled).toBe(true);
  },
);
it("keeps a failed save open with an error and allows retry", async () => {
  vi.mocked(mutate).mockRejectedValueOnce(new Error("Save failed"));
  await form(session).props.onSubmit(event());
  expect(router.replace).not.toHaveBeenCalled();
  const failed = children(form(session));
  expect(failed.at(-1)?.props.disabled).toBe(false);
  expect(failed.some((child) => child.props.role === "alert")).toBe(true);
  expect(failed.some((child) => child.type === LoadingIndicator)).toBe(false);
  vi.mocked(mutate).mockResolvedValueOnce({ ok: true });
  await form(session).props.onSubmit(event());
  expect(router.replace).toHaveBeenCalledWith("/sessions/");
});
it("provides accessible loading text with a decorative spinner", () => {
  const html = renderToStaticMarkup(<LoadingIndicator label="Sparar…" />);
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("Sparar…");
});
