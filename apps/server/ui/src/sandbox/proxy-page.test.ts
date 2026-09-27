import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// The sandbox proxy's script, as the server serves it, run against a window,
// a service worker container and caches kept in memory.
const PAGE = readFileSync(
  new URL("../../../src/app/mcp/sandbox.html", import.meta.url),
  "utf-8",
);
const SCRIPT = PAGE.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

const ORIGIN = "https://api.graspy.test";
const HOST = "https://graspy.test";
const SANDBOX = "/ui-sandbox/0123456789abcdef/";
const EARLIER = "/ui-sandbox/fedcba9876543210/";
const OLDER = "/ui-sandbox/00000000aaaaaaaa/";
const KEPT = "graspy/sandbox-kept";

interface Frame {
  attributes: Map<string, string>;
  src: string;
  written: string[];
  contentWindow: { postMessage: ReturnType<typeof vi.fn> };
  load: () => void;
}

interface Options {
  host?: string | null;
  top?: boolean;
  workers?: boolean;
  kept?: boolean;
}

function proxy({
  host = HOST,
  top = false,
  workers = true,
  kept = true,
}: Options = {}) {
  const listeners: ((event: object) => void)[] = [];
  const parent = { postMessage: vi.fn() };
  const window = {
    parent,
    addEventListener: (_: string, listener: (event: object) => void) =>
      listeners.push(listener),
  } as Record<string, unknown>;
  window.self = window;
  window.top = top ? window : parent;
  const frames: Frame[] = [];
  const document = {
    body: { appendChild: vi.fn() },
    createElement: () => {
      const written: string[] = [];
      let loaded: () => void = () => undefined;
      const frame: Frame = {
        attributes: new Map(),
        src: "",
        written,
        contentWindow: { postMessage: vi.fn() },
        load: () => loaded(),
      };
      frames.push(frame);
      return Object.assign(frame, {
        setAttribute: (name: string, value: string) =>
          frame.attributes.set(name, value),
        addEventListener: (_: string, listener: () => void) => {
          loaded = listener;
        },
        contentDocument: {
          open: () => undefined,
          write: (html: string) => written.push(html),
          close: () => undefined,
        },
      });
    },
  };
  const query = host === null ? "" : `?host=${encodeURIComponent(host)}`;
  const location = {
    origin: ORIGIN,
    pathname: SANDBOX,
    search: query,
    href: `${ORIGIN}${SANDBOX}${query}`,
  };
  const registrations = [SANDBOX, EARLIER, OLDER, "/ui-sandbox"].map(
    (scope) => ({
      scope: `${ORIGIN}${scope}`,
      unregister: vi.fn(async () => true),
    }),
  );
  const active = {
    postMessage: vi.fn((_: unknown, [port]: MessagePort[]) => {
      port.postMessage({ kept });
      port.close();
    }),
  };
  const serviceWorker = {
    register: vi.fn(async () => registrations[0]),
    ready: Promise.resolve({ ...registrations[0], active }),
    getRegistrations: async () => registrations,
  };
  const navigator = workers ? { serviceWorker } : {};
  const cacheNames = [SANDBOX, EARLIER, OLDER].map(
    (scope) => `graspy-view-files:${scope}`,
  );
  const caches = {
    keys: async () => [...cacheNames, "graspy-view-assets-v1"],
    delete: vi.fn(async (_name: string) => true),
  };
  new Function("window", "document", "location", "navigator", "caches", SCRIPT)(
    window,
    document,
    location,
    navigator,
    caches,
  );
  const send = (data: unknown, origin = HOST, source: unknown = parent) =>
    listeners.forEach((listener) => listener({ data, origin, source }));
  const told = () => parent.postMessage.mock.calls.map(([data]) => data);
  return {
    send,
    told,
    frames,
    serviceWorker,
    registrations,
    caches,
    active,
    parent,
  };
}

const keep = (sandboxes: unknown) => ({
  jsonrpc: "2.0",
  method: "graspy/sandbox-keep",
  params: { sandboxes },
});
const resourceReady = (params: object) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/sandbox-resource-ready",
  params,
});

afterEach(() => vi.restoreAllMocks());

describe("the sandbox proxy", () => {
  it("tells its host it is ready, and registers its build's worker", () => {
    const page = proxy();

    expect(page.told()).toEqual([
      {
        jsonrpc: "2.0",
        method: "ui/notifications/sandbox-proxy-ready",
        params: {},
      },
    ]);
    expect(page.parent.postMessage).toHaveBeenCalledWith(
      expect.anything(),
      HOST,
    );
    expect(page.serviceWorker.register).toHaveBeenCalledWith("sw.js");
  });

  it.each([
    ["opened on its own", { top: true }],
    ["named no host", { host: null }],
  ])("does nothing %s", (_, options) => {
    const page = proxy(options);

    expect(page.told()).toEqual([]);
    expect(page.serviceWorker.register).not.toHaveBeenCalled();
  });

  it("writes the view into its build's view page, with its own sandbox flags", () => {
    const page = proxy();

    page.send(
      resourceReady({
        html: "<html>lesson</html>",
        sandbox:
          "allow-scripts allow-same-origin allow-top-navigation allow-popups",
        permissions: { microphone: {}, usb: {} },
      }),
    );
    const [frame] = page.frames;
    frame.load();

    expect(frame.src).toBe(
      `${ORIGIN}${SANDBOX}frame?host=${encodeURIComponent(HOST)}`,
    );
    expect(frame.attributes.get("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-forms",
    );
    expect(frame.attributes.get("allow")).toBe("microphone");
    expect(frame.written).toEqual(["<html>lesson</html>"]);
  });

  it("takes a view only from its host, and only once", () => {
    const page = proxy();

    page.send(
      resourceReady({ html: "<html>planted</html>" }),
      "https://evil.example",
    );
    page.send(resourceReady({ html: "<html>lesson</html>" }));
    page.send(resourceReady({ html: "<html>again</html>" }));

    expect(page.frames).toHaveLength(1);
  });

  it("passes messages between its host and the view, and no one else's", () => {
    const page = proxy();
    page.send(resourceReady({ html: "<html>lesson</html>" }));
    const [frame] = page.frames;
    const view = frame.contentWindow;

    page.send({ method: "ui/notifications/tool-result" });
    page.send({ method: "from elsewhere" }, "https://evil.example");
    page.send({ method: "ui/size-changed" }, ORIGIN, view);
    page.send({ method: "from a stranger" }, ORIGIN, {});

    expect(view.postMessage.mock.calls).toEqual([
      [{ method: "ui/notifications/tool-result" }, ORIGIN],
    ]);
    expect(page.told().at(-1)).toEqual({ method: "ui/size-changed" });
  });
});

describe("a keep its host asks for", () => {
  it("has the worker keep the build's files, and says so", async () => {
    const page = proxy();

    page.send(keep([EARLIER]));

    await vi.waitFor(() =>
      expect(page.told().at(-1)).toEqual({
        jsonrpc: "2.0",
        method: KEPT,
        params: { kept: true },
      }),
    );
    expect(page.active.postMessage).toHaveBeenCalledWith({ type: "keep" }, [
      expect.anything(),
    ]);
  });

  it("says so when the worker could not keep them", async () => {
    const page = proxy({ kept: false });

    page.send(keep([]));

    await vi.waitFor(() =>
      expect(page.told().at(-1)).toMatchObject({ params: { kept: false } }),
    );
  });

  it("drops every worker and cache of a build no kept page needs, never its own", async () => {
    const page = proxy();

    page.send(keep([EARLIER, 42, "https://evil.example/x/"]));

    await vi.waitFor(() =>
      expect(page.told().at(-1)).toMatchObject({ method: KEPT }),
    );
    const dropped = page.registrations
      .filter((registration) => registration.unregister.mock.calls.length)
      .map((registration) => registration.scope);
    expect(dropped).toEqual([`${ORIGIN}${OLDER}`, `${ORIGIN}/ui-sandbox`]);
    expect(page.caches.delete.mock.calls.map(([name]) => name)).toEqual([
      `graspy-view-files:${OLDER}`,
      "graspy-view-assets-v1",
    ]);
  });

  it("says nothing is kept where the browser refuses workers", async () => {
    const page = proxy({ workers: false });

    page.send(keep([]));

    await vi.waitFor(() =>
      expect(page.told().at(-1)).toMatchObject({ params: { kept: false } }),
    );
    expect(page.caches.delete).not.toHaveBeenCalled();
  });

  it("is taken only from its host", async () => {
    const page = proxy();

    page.send(keep([]), "https://evil.example");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(page.active.postMessage).not.toHaveBeenCalled();
    expect(page.told()).toHaveLength(1);
  });
});
