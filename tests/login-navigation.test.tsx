import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  submitted: { current: false },
  busy: false,
  setBusy: vi.fn(),
  effect: undefined as (() => void | (() => void)) | undefined,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => state.submitted,
  useState: () => [state.busy, state.setBusy],
  useEffect: (effect: () => void | (() => void)) => {
    state.effect = effect;
  },
}));
vi.mock("../components/language-provider", () => ({
  useI18n: () => ({ tr: swText }),
}));
import { swText } from "../lib/i18n";
import { LoginButton } from "../components/login-button";
import { renderToStaticMarkup } from "react-dom/server";
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  state.submitted.current = false;
  state.busy = false;
  state.setBusy.mockReset();
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { location: { assign: vi.fn() } }),
  );
});
it("locks synchronously before rendering and starts only one same-origin page navigation", () => {
  const button = LoginButton();
  const click: () => void = button.props.onClick;
  click();
  click();
  click();
  expect(window.location.assign).toHaveBeenCalledExactlyOnceWith(
    "/auth/github/",
  );
  expect(state.setBusy).toHaveBeenCalledExactlyOnceWith(true);
  state.busy = true;
  const busy = renderToStaticMarkup(LoginButton());
  expect(busy).toContain('disabled=""');
  expect(busy).toContain('aria-busy="true"');
  expect(busy).toContain("loading-spinner");
  expect(busy).toContain(swText("login.connecting"));
});
it("unlocks after a cached-page restore and removes its lifecycle listener on unmount", () => {
  const button = LoginButton();
  const click: () => void = button.props.onClick;
  const cleanup = state.effect?.();
  click();
  const restore = new Event("pageshow");
  Object.defineProperty(restore, "persisted", { value: true });
  window.dispatchEvent(restore);
  expect(state.setBusy).toHaveBeenLastCalledWith(false);
  click();
  expect(window.location.assign).toHaveBeenCalledTimes(2);
  cleanup?.();
  state.setBusy.mockClear();
  window.dispatchEvent(restore);
  expect(state.setBusy).not.toHaveBeenCalled();
});
