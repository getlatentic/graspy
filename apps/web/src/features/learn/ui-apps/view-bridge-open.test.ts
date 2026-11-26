import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mcp/server", () => ({
  HOST_INFO: { name: "graspy", version: "1.0.0" },
  uiView: async () => ({}),
}));
vi.mock("@/lib/mcp/sandbox", () => ({ sandboxAddress: () => "" }));
vi.mock("@/lib/mcp/outbox", () => ({ callOrKeep: vi.fn() }));
vi.mock("@modelcontextprotocol/ext-apps/app-bridge", () => ({
  AppBridge: class {},
  PostMessageTransport: class {},
}));

const { bridgeTo } = await import("./view-bridge");

type OpenLink = (params: { url: string }) => Promise<object>;

function openLinkOf(host: { open?: (url: string) => void }): OpenLink {
  const frame = {} as HTMLIFrameElement;
  const bridge = bridgeTo(
    frame,
    () => ({ toolCalled: vi.fn(), message: () => false, ...host }),
    {},
  );
  return (bridge as unknown as { onopenlink: OpenLink }).onopenlink;
}

afterEach(() => vi.unstubAllGlobals());

describe("a view's request to open a link", () => {
  it("hands a place in the app to the host, which decides whether to follow it", async () => {
    const open = vi.fn();

    await openLinkOf({ open })({ url: "/app/learn/maths/lesson/0?lesson=abc" });

    expect(open).toHaveBeenCalledWith("/app/learn/maths/lesson/0?lesson=abc");
  });

  it("opens a web address in a new tab, and never hands it to the host", async () => {
    const opened = vi.fn();
    vi.stubGlobal("window", { open: opened });
    const open = vi.fn();

    await openLinkOf({ open })({ url: "https://example.com/page" });

    expect(opened).toHaveBeenCalledWith(
      "https://example.com/page",
      "_blank",
      "noopener,noreferrer",
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("goes nowhere when the host has no place to follow it to", async () => {
    await expect(
      openLinkOf({})({ url: "/app/learn/maths/lesson/0" }),
    ).resolves.toEqual({});
  });
});
