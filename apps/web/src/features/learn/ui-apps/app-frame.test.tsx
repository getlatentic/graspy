// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { AppFrame } from "./app-frame";
import { bridgeTo, showView } from "./view-bridge";

vi.mock("@/lib/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en" }),
}));
vi.mock("@/lib/mcp/server", () => ({
  uiView: vi.fn(async () => ({ title: "A view" })),
}));
vi.mock("./view-bridge", () => ({
  bridgeTo: vi.fn(() => ({
    sendHostContextChange: vi.fn(async () => undefined),
  })),
  tellHostContext: (
    bridge: { sendHostContextChange: (c: object) => void },
    changed: object,
  ) => bridge.sendHostContextChange(changed),
  closeView: vi.fn(async () => undefined),
  hostContextFor: (locale: string, theme: string) => ({ locale, theme }),
  showView: vi.fn(() => new Promise<void>(() => undefined)),
}));

const CARD = {
  resourceUri: "ui://view",
  toolName: "show",
  toolInput: {},
  toolResult: { content: [] },
} as TutorCard;
const HOST = {} as Parameters<typeof AppFrame>[0]["host"];

/** A device whose colour scheme can change, as `prefers-color-scheme` does. */
function deviceScheme(initial: "light" | "dark") {
  let dark = initial === "dark";
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("prefers-color-scheme: dark") && dark;
    },
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  return (scheme: "light" | "dark") => {
    dark = scheme === "dark";
    act(() => listeners.forEach((listener) => listener()));
  };
}

beforeEach(() => {
  vi.mocked(bridgeTo).mockClear();
  vi.mocked(showView).mockReset();
  vi.mocked(showView).mockImplementation(() => new Promise<void>(() => {}));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppFrame on Chromium 108, which has no AbortSignal.any", () => {
  it("shows the view and stops it when the card leaves", () => {
    deviceScheme("light");
    vi.stubGlobal("AbortSignal", {
      abort: AbortSignal.abort.bind(AbortSignal),
      timeout: AbortSignal.timeout.bind(AbortSignal),
    });
    expect(AbortSignal.any).toBeUndefined();

    const { unmount } = render(<AppFrame card={CARD} host={HOST} />);

    const signal = vi.mocked(showView).mock.calls[0]![3];
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe("the view's colours", () => {
  it.each(["light", "dark"] as const)(
    "start as the device's, %s, in the context the view is opened with",
    (scheme) => {
      deviceScheme(scheme);

      render(<AppFrame card={CARD} host={HOST} />);

      expect(vi.mocked(bridgeTo).mock.calls[0]![2]).toEqual({
        locale: "en",
        theme: scheme,
      });
    },
  );

  it("follow the device while the view is open, without opening it again", async () => {
    const change = deviceScheme("light");
    vi.mocked(showView).mockResolvedValue();
    render(<AppFrame card={CARD} host={HOST} />);
    const bridge = vi.mocked(bridgeTo).mock.results[0]!.value;
    await vi.waitFor(() =>
      expect(bridge.sendHostContextChange).toHaveBeenCalled(),
    );
    bridge.sendHostContextChange.mockClear();

    change("dark");
    expect(bridge.sendHostContextChange).toHaveBeenLastCalledWith({
      theme: "dark",
    });
    change("light");
    expect(bridge.sendHostContextChange).toHaveBeenLastCalledWith({
      theme: "light",
    });
    expect(bridgeTo).toHaveBeenCalledTimes(1);
    expect(showView).toHaveBeenCalledTimes(1);
  });

  it("are not sent to a view that has not shown yet, which is told once it has", async () => {
    const change = deviceScheme("light");
    let shown: () => void = () => undefined;
    vi.mocked(showView).mockReturnValue(
      new Promise<void>((resolve) => (shown = resolve)),
    );
    render(<AppFrame card={CARD} host={HOST} />);
    const bridge = vi.mocked(bridgeTo).mock.results[0]!.value;

    change("dark");
    expect(bridge.sendHostContextChange).not.toHaveBeenCalled();

    await act(async () => shown());
    expect(bridge.sendHostContextChange).toHaveBeenCalledWith({
      theme: "dark",
    });
  });

  it("are not sent to a view that has been closed", async () => {
    const change = deviceScheme("light");
    let shown: () => void = () => undefined;
    vi.mocked(showView).mockReturnValue(
      new Promise<void>((resolve) => (shown = resolve)),
    );
    const { unmount } = render(<AppFrame card={CARD} host={HOST} />);
    const bridge = vi.mocked(bridgeTo).mock.results[0]!.value;
    unmount();

    await act(async () => shown());
    change("dark");

    expect(bridge.sendHostContextChange).not.toHaveBeenCalled();
  });
});

describe("the view's frame", () => {
  it("fills the width of its column and paints nothing of its own", () => {
    deviceScheme("dark");

    const { container } = render(<AppFrame card={CARD} host={HOST} />);

    const frame = container.querySelector("iframe")!;
    expect(frame.classList).toContain("w-full");
    expect(frame.classList).toContain("block");
    expect(frame.classList).toContain("border-0");
    expect([...frame.classList].some((name) => name.startsWith("bg-"))).toBe(
      false,
    );
  });
});
