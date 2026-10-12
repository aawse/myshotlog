import { beforeEach, expect, it, vi } from "vitest";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
const state = vi.hoisted(() => ({
  values: [] as unknown[],
  index: 0,
  close: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] =
          typeof value === "function" ? value(state.values[index]) : value;
      },
    ];
  },
  useRef: () => ({ current: { close: state.close } }),
  useEffect: () => {},
}));
vi.mock("../components/language-provider", async () => ({
  useI18n: (await import("../lib/i18n")).translator.bind(null, "en"),
}));
import { PhotoViewer } from "../components/photo-viewer";
import { LoadingIndicator } from "../components/loading-indicator";
beforeEach(() => {
  state.values = [];
  state.index = 0;
  vi.clearAllMocks();
});
function render() {
  state.index = 0;
  return PhotoViewer({ src: "/api/photos/test/", label: "Min tavla" });
}
function elements(
  root: ReactElement<{ children?: ReactNode }>,
): ReturnType<typeof render>[] {
  return [
    root,
    ...Children.toArray(root.props.children).flatMap((child) =>
      isValidElement<{ children?: ReactNode }>(child) ? elements(child) : [],
    ),
  ] as ReturnType<typeof render>[];
}
it("opens in a dialog with loading feedback until the full image loads and preserves user labels", () => {
  let tree = elements(render());
  expect(tree.some((node) => node.type === "a")).toBe(false);
  expect(tree.some((node) => node.type === "img")).toBe(false);
  tree
    .find(
      (node) =>
        node.type === "button" && node.props.className === "photo-thumbnail",
    )!
    .props.onClick();
  tree = elements(render());
  expect(tree.find((node) => node.type === "dialog")?.props["aria-label"]).toBe(
    "Target photo: Min tavla",
  );
  expect(tree.some((node) => node.type === LoadingIndicator)).toBe(true);
  const image = tree.find((node) => node.type === "img")!;
  expect(image.props.src).toBe("/api/photos/test/");
  image.props.onLoad();
  tree = elements(render());
  expect(tree.some((node) => node.type === LoadingIndicator)).toBe(false);
  expect(tree.find((node) => node.type === "img")?.props.className).toBe(
    "photo-full",
  );
  tree
    .find(
      (node) => node.type === "button" && node.props["aria-label"] === "Close",
    )!
    .props.onClick();
  expect(state.close).toHaveBeenCalledOnce();
  tree.find((node) => node.type === "dialog")!.props.onClose();
  expect(elements(render()).some((node) => node.type === "img")).toBe(false);
});
it("shows an error and retries without reopening a window, and supports backdrop closing", () => {
  elements(render())
    .find((node) => node.type === "button")!
    .props.onClick();
  let tree = elements(render());
  const previousImage = tree.find((node) => node.type === "img")!;
  previousImage.props.onError();
  tree = elements(render());
  expect(tree.some((node) => node.props.role === "alert")).toBe(true);
  expect(tree.some((node) => node.type === LoadingIndicator)).toBe(false);
  tree
    .find((node) => node.type === "button" && !node.props["aria-label"])!
    .props.onClick();
  tree = elements(render());
  expect(tree.some((node) => node.type === LoadingIndicator)).toBe(true);
  expect(tree.find((node) => node.type === "img")?.key).not.toBe(
    previousImage.key,
  );
  const dialog = tree.find((node) => node.type === "dialog")!;
  const backdrop = {};
  dialog.props.onClick({ target: {}, currentTarget: backdrop });
  expect(state.close).not.toHaveBeenCalled();
  dialog.props.onClick({ target: backdrop, currentTarget: backdrop });
  expect(state.close).toHaveBeenCalledOnce();
});
