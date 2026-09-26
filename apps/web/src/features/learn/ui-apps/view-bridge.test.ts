import type { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorCard } from "@/lib/a2a/reply-data";

const VIEW = { html: "<html>lesson</html>", title: "Lesson" };
const keepView = vi.fn();
vi.mock("@/lib/mcp/server", () => ({
  HOST_INFO: { name: "graspy", version: "1.0.0" },
  SANDBOX_URL: new URL("https://api.test/ui-sandbox"),
  uiView: async () => VIEW,
  keepView,
}));
vi.mock("@/lib/mcp/outbox", () => ({ callOrKeep: vi.fn() }));
vi.mock("@modelcontextprotocol/ext-apps/app-bridge", () => ({
  AppBridge: class {},
  PostMessageTransport: class {},
}));

const { showView } = await import("./view-bridge");

const CARD = {
  resourceUri: "ui://graspy/lesson",
  toolName: "give_lesson",
  toolInput: {},
  toolResult: { content: [] },
} as unknown as TutorCard;

/** A frame whose sandbox proxy says it is ready as soon as it is given its address. */
function sandboxFrame(): HTMLIFrameElement {
  const heard = new Set<(event: MessageEvent) => void>();
  vi.stubGlobal("window", {
    location: { origin: "https://app.test" },
    addEventListener: (_: string, listener: (event: MessageEvent) => void) =>
      heard.add(listener),
    removeEventListener: (_: string, listener: (event: MessageEvent) => void) =>
      heard.delete(listener),
  });
  const proxy = {};
  const ready = {
    source: proxy,
    data: { method: "ui/notifications/sandbox-proxy-ready" },
  } as unknown as MessageEvent;
  return {
    contentWindow: proxy,
    set src(_: string) {
      queueMicrotask(() => heard.forEach((listener) => listener(ready)));
    },
  } as unknown as HTMLIFrameElement;
}

function fakeBridge() {
  return {
    oninitialized: undefined as (() => void) | undefined,
    connect: vi.fn(async () => {}),
    sendSandboxResourceReady: vi.fn(async () => {}),
    sendToolInput: vi.fn(async () => {}),
    sendToolResult: vi.fn(async () => {}),
  };
}

async function shownUntilLoaded(signal: AbortSignal) {
  const bridge = fakeBridge();
  const shown = showView(
    sandboxFrame(),
    bridge as unknown as AppBridge,
    CARD,
    signal,
  );
  await vi.waitFor(() =>
    expect(bridge.sendSandboxResourceReady).toHaveBeenCalledWith(VIEW),
  );
  return { bridge, shown };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  keepView.mockReset();
});

describe("a view being shown", () => {
  it("keeps its page only once the view has initialized in the sandbox", async () => {
    const { bridge, shown } = await shownUntilLoaded(
      new AbortController().signal,
    );
    expect(keepView).not.toHaveBeenCalled();

    bridge.oninitialized?.();
    await shown;

    expect(keepView).toHaveBeenCalledWith(CARD.resourceUri, VIEW);
  });

  it("keeps nothing when it never initializes", async () => {
    const leaving = new AbortController();
    const { shown } = await shownUntilLoaded(leaving.signal);

    leaving.abort();

    await expect(shown).rejects.toThrow();
    expect(keepView).not.toHaveBeenCalled();
  });
});
