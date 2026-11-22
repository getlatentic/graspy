// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { AppFrame } from "./app-frame";
import { showView } from "./view-bridge";

vi.mock("@/lib/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en" }),
}));
vi.mock("@/lib/mcp/server", () => ({
  uiView: vi.fn(async () => ({ title: "A view" })),
}));
vi.mock("./view-bridge", () => ({
  VIEW_MAX_HEIGHT: 2000,
  bridgeTo: vi.fn(() => ({})),
  closeView: vi.fn(async () => undefined),
  showView: vi.fn(() => new Promise<void>(() => undefined)),
}));

const CARD = {
  resourceUri: "ui://view",
  toolName: "show",
  toolInput: {},
  toolResult: { content: [] },
} as TutorCard;
const HOST = {} as Parameters<typeof AppFrame>[0]["host"];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppFrame on Chromium 108, which has no AbortSignal.any", () => {
  it("shows the view and stops it when the card leaves", () => {
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
