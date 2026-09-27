import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ API_BASE_URL: "https://api.test/api" }));

const { keepSandbox, sandboxAddress } = await import("./sandbox");

const API = "https://api.test";
const SANDBOX = "/ui-sandbox/0123456789abcdef/";
const EARLIER = "/ui-sandbox/fedcba9876543210/";
const PROXY_READY = { method: "ui/notifications/sandbox-proxy-ready" };
const kept = (answer: boolean) => ({
  jsonrpc: "2.0",
  method: "graspy/sandbox-kept",
  params: { kept: answer },
});

interface Frame {
  hidden: boolean;
  tabIndex: number;
  attributes: Map<string, string>;
  src: string;
  removed: boolean;
  contentWindow: { postMessage: ReturnType<typeof vi.fn> };
}

let listeners: Set<(event: MessageEvent) => void>;
let frames: Frame[];

/** What the frame's proxy says, from its window and origin unless another is given. */
function say(data: unknown, origin = API, source?: unknown) {
  const event = {
    data,
    origin,
    source: source ?? frames[0].contentWindow,
  } as MessageEvent;
  listeners.forEach((listener) => listener(event));
}

beforeEach(() => {
  vi.useFakeTimers();
  listeners = new Set();
  frames = [];
  vi.stubGlobal("window", {
    location: { origin: "https://app.test" },
    addEventListener: (
      _: string,
      listener: (event: MessageEvent) => void,
      { signal }: { signal: AbortSignal },
    ) => {
      listeners.add(listener);
      signal.addEventListener("abort", () => listeners.delete(listener));
    },
  });
  vi.stubGlobal("document", {
    createElement: () => {
      const frame: Frame = {
        hidden: false,
        tabIndex: 0,
        attributes: new Map(),
        src: "",
        removed: false,
        contentWindow: { postMessage: vi.fn() },
      };
      frames.push(frame);
      return Object.assign(frame, {
        setAttribute: (name: string, value: string) =>
          frame.attributes.set(name, value),
        remove: () => {
          frame.removed = true;
        },
      });
    },
    body: { append: vi.fn() },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a sandbox's address", () => {
  it("is its path on the server, framed by this app", () => {
    expect(sandboxAddress(SANDBOX)).toBe(
      `${API}${SANDBOX}?host=${encodeURIComponent("https://app.test")}`,
    );
  });
});

describe("keeping a sandbox's files", () => {
  it("asks the proxy, once ready, naming the sandboxes kept pages need", async () => {
    const keeping = keepSandbox(SANDBOX, new Set([EARLIER, SANDBOX]));
    const [frame] = frames;

    say(PROXY_READY);
    say(kept(true));

    await expect(keeping).resolves.toBe(true);
    expect(frame.src).toBe(sandboxAddress(SANDBOX));
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(
      {
        jsonrpc: "2.0",
        method: "graspy/sandbox-keep",
        params: { sandboxes: [EARLIER, SANDBOX] },
      },
      API,
    );
  });

  it("is done in a frame no one sees, sandboxed, and gone after", async () => {
    const keeping = keepSandbox(SANDBOX, [SANDBOX]);
    const [frame] = frames;
    say(PROXY_READY);
    say(kept(true));
    await keeping;

    expect(frame.hidden).toBe(true);
    expect(frame.tabIndex).toBe(-1);
    expect(frame.attributes.get("aria-hidden")).toBe("true");
    expect(frame.attributes.get("sandbox")).toBe(
      "allow-scripts allow-same-origin",
    );
    expect(frame.removed).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it("is false when the worker could not keep them", async () => {
    const keeping = keepSandbox(SANDBOX, [SANDBOX]);
    say(PROXY_READY);
    say(kept(false));

    await expect(keeping).resolves.toBe(false);
  });

  it("is false when the proxy never answers", async () => {
    const keeping = keepSandbox(SANDBOX, [SANDBOX]);
    say(PROXY_READY);

    await vi.advanceTimersByTimeAsync(180_000);

    await expect(keeping).resolves.toBe(false);
    expect(frames[0].removed).toBe(true);
  });

  it("hears only its own frame, on the server's origin", async () => {
    const keeping = keepSandbox(SANDBOX, [SANDBOX]);
    const [frame] = frames;

    say(PROXY_READY, "https://evil.example");
    say(kept(true), API, {});
    say(kept(true), "https://evil.example");
    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled();

    say(kept(false));
    await expect(keeping).resolves.toBe(false);
  });
});
