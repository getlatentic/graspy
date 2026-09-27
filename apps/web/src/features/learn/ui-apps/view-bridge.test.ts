import type { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorCard } from "@/lib/a2a/reply-data";

const VIEW = {
  html: "<html>lesson</html>",
  title: "Lesson",
  sandbox: "/ui-sandbox/0123456789abcdef/",
};
vi.mock("@/lib/mcp/server", () => ({
  HOST_INFO: { name: "graspy", version: "1.0.0" },
  uiView: async () => VIEW,
}));
const { keepView } = vi.hoisted(() => ({ keepView: vi.fn() }));
vi.mock("@/lib/mcp/view-copies", () => ({ keepView }));
vi.mock("@/lib/mcp/sandbox", () => ({
  sandboxAddress: (sandbox: string) => `https://api.test${sandbox}?host=app`,
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
function sandboxFrame(addresses: string[] = []): HTMLIFrameElement {
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
    set src(address: string) {
      addresses.push(address);
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

async function shownUntilLoaded(signal: AbortSignal, addresses: string[] = []) {
  const bridge = fakeBridge();
  const shown = showView(
    sandboxFrame(addresses),
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
  it("opens in the sandbox of its page's build", async () => {
    const addresses: string[] = [];
    await shownUntilLoaded(new AbortController().signal, addresses);

    expect(addresses).toEqual([
      "https://api.test/ui-sandbox/0123456789abcdef/?host=app",
    ]);
  });

  it("never replaces the page kept: only a keep that holds its files does", async () => {
    const { bridge, shown } = await shownUntilLoaded(
      new AbortController().signal,
    );

    bridge.oninitialized?.();
    await shown;

    expect(bridge.sendToolResult).toHaveBeenCalled();
    expect(keepView).not.toHaveBeenCalled();
  });
});
