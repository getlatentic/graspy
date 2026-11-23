import { afterEach, describe, expect, it, vi } from "vitest";
import source from "../../public/sw.js?raw";

const ORIGIN = "https://app.test";
const ROOT = '<div id="root"></div>';
const OLD = `<html>old build${ROOT}</html>`;
const NEW = `<html>new build${ROOT}</html>`;

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (key: unknown) =>
    typeof key === "string" ? key : String((key as Request).url);
  return {
    stores,
    async open(name: string) {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (key: unknown) => store.get(keyOf(key))?.clone(),
        put: async (key: unknown, response: Response) =>
          void store.set(keyOf(key), response),
        keys: async () => [...store.keys()],
        delete: async (key: unknown) => store.delete(keyOf(key)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
}

/** The worker run against a fake browser, with the network answering `network`. */
function startWorker(network: (url?: string) => Promise<Response>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const told: unknown[] = [];
  const asker = { postMessage: (message: unknown) => told.push(message) };
  const caches = fakeCaches();
  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      void (listeners[type] = listener),
    skipWaiting: () => undefined,
    location: { origin: ORIGIN },
    clients: { claim: async () => undefined },
  };
  new Function("self", "caches", "fetch", source)(self, caches, network);

  async function open(path = "/app/learn") {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> = new Promise(() => undefined);
    listeners.fetch({
      request: { method: "GET", url: ORIGIN + path, mode: "navigate" },
      respondWith: (response: Promise<Response>) => void (answer = response),
      waitUntil: (work: Promise<unknown>) => void waits.push(work),
    });
    return { answer, settled: () => Promise.all(waits) };
  }
  /** The loaded page asking whether the document it was served was a deploy behind. */
  async function check() {
    const waits: Promise<unknown>[] = [];
    listeners.message({
      data: { type: "check" },
      source: asker,
      waitUntil: (work: Promise<unknown>) => void waits.push(work),
    });
    await Promise.all(waits);
  }
  /** A script the page asks for. */
  async function openFile(path: string) {
    let answer: Promise<Response> = new Promise(() => undefined);
    const request = { method: "GET", url: ORIGIN + path, mode: "no-cors" };
    listeners.fetch({
      request,
      respondWith: (response: Promise<Response>) => void (answer = response),
      waitUntil: () => undefined,
    });
    return answer;
  }
  /** The worker taking over from an older one. */
  async function activate() {
    const waits: Promise<unknown>[] = [];
    listeners.activate({
      waitUntil: (work: Promise<unknown>) => waits.push(work),
    });
    await Promise.all(waits);
  }
  return { open, openFile, caches, told, check, activate };
}

const page = (body: string) => async () => new Response(body);
const kept = async (worker: ReturnType<typeof startWorker>, body: string) => {
  const cache = await worker.caches.open("graspy-shell-v1");
  await cache.put("/", new Response(body));
};

// What public/sw.js waits for the network's document before the last copy answers.
const NAVIGATION_WAIT_MS = 2000;

describe("the service worker's page", () => {
  afterEach(() => vi.useRealTimers());

  it("answers with the network's document when it comes in time, though a copy is kept", async () => {
    const worker = startWorker(page(NEW));
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    expect(await (await answer).text()).toBe(NEW);
    await settled();
    const cache = await worker.caches.open("graspy-shell-v1");
    expect(await (await cache.match("/"))!.text()).toBe(NEW);
  });

  it("has nothing to reload into when the page is on the network's build already", async () => {
    const worker = startWorker(page(NEW));
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    await answer;
    await settled();
    await worker.check();
    expect(worker.told).toEqual([]);
  });

  it("answers from the kept copy once the network is slower than the wait", async () => {
    vi.useFakeTimers();
    const worker = startWorker(() => new Promise<Response>(() => undefined));
    await kept(worker, OLD);
    const { answer } = await worker.open();
    await vi.advanceTimersByTimeAsync(NAVIGATION_WAIT_MS);
    expect(await (await answer).text()).toBe(OLD);
  });

  it("does not make a learner wait the whole time for a network that has failed", async () => {
    vi.useFakeTimers();
    const worker = startWorker(
      async () => new Response("down", { status: 503 }),
    );
    await kept(worker, OLD);
    const { answer } = await worker.open();
    // No timer is advanced: a failed answer is not waited out.
    expect(await (await answer).text()).toBe(OLD);
  });

  it("tells the page that asks, once the slow network has answered with a newer document", async () => {
    vi.useFakeTimers();
    let answerNetwork: (response: Response) => void = () => undefined;
    const worker = startWorker(
      () => new Promise<Response>((resolve) => (answerNetwork = resolve)),
    );
    await kept(worker, OLD);
    const { answer } = await worker.open();
    await vi.advanceTimersByTimeAsync(NAVIGATION_WAIT_MS);
    expect(await (await answer).text()).toBe(OLD);
    const asked = worker.check();
    answerNetwork(new Response(NEW));
    await asked;
    expect(worker.told).toEqual([{ type: "update-ready" }]);
  });

  it("is on the new build after one reload when the network was too slow", async () => {
    vi.useFakeTimers();
    let slow = true;
    const worker = startWorker(async () => {
      if (slow) await new Promise((resolve) => setTimeout(resolve, 3000));
      return new Response(NEW);
    });
    await kept(worker, OLD);
    const first = await worker.open();
    await vi.advanceTimersByTimeAsync(NAVIGATION_WAIT_MS);
    expect(await (await first.answer).text()).toBe(OLD);
    await vi.advanceTimersByTimeAsync(NAVIGATION_WAIT_MS);
    await first.settled();
    await worker.check();
    expect(worker.told).toHaveLength(1);
    slow = false;
    const reload = await worker.open();
    expect(await (await reload.answer).text()).toBe(NEW);
    await reload.settled();
    await worker.check();
    expect(worker.told).toHaveLength(1);
  });

  it("says nothing when the document is the same", async () => {
    const worker = startWorker(page(OLD));
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    await answer;
    await settled();
    await worker.check();
    expect(worker.told).toEqual([]);
  });

  it("takes the network's document on the first visit, and keeps it", async () => {
    const worker = startWorker(page(NEW));
    const { answer, settled } = await worker.open();
    expect(await (await answer).text()).toBe(NEW);
    await settled();
    const cache = await worker.caches.open("graspy-shell-v1");
    expect(await (await cache.match("/"))!.text()).toBe(NEW);
    expect(worker.told).toEqual([]);
  });

  it("opens from the kept copy with no connection, at once", async () => {
    const worker = startWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    expect(await (await answer).text()).toBe(OLD);
    await expect(settled()).resolves.toBeDefined();
  });

  it("fails on the first visit with no connection", async () => {
    const error = vi.fn();
    const worker = startWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { answer } = await worker.open();
    await answer.catch(error);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("the service worker's new build", () => {
  const entry = "/assets/index-NEW.js";
  const withScripts = `<html>${ROOT}<script src="${entry}"></script><link rel="modulepreload" href="/assets/cn-NEW.js"></html>`;

  it("keeps the new build's startup files before telling the page", async () => {
    const fetched: string[] = [];
    const worker = startWorker(async (url) => {
      fetched.push(String(url));
      return new Response(String(url) === "/" ? withScripts : "script");
    });
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    await answer;
    await settled();
    await worker.check();
    const files = await worker.caches.open("graspy-files-v2");
    for (const name of [entry, "/assets/cn-NEW.js"]) {
      expect(await files.match(ORIGIN + name)).toBeDefined();
    }
    expect(worker.told).toEqual([]);
  });

  it("downloads a startup file once when the page asks for it while the worker keeps it", async () => {
    const calls: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const worker = startWorker(async (url) => {
      calls.push(String(url));
      if (String(url) === "/") return new Response(withScripts);
      await held;
      return new Response("script");
    });
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    await answer;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const asked = worker.openFile(entry);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    expect(await (await asked).text()).toBe("script");
    await settled();
    // The entry script and the one it preloads, once each: the page's ask shared the first.
    expect(calls.filter((url) => url !== "/")).toHaveLength(2);
  });

  it("keeps the old document, and says nothing, when a file cannot be kept", async () => {
    const worker = startWorker(async (url) => {
      if (String(url) !== "/") throw new TypeError("Failed to fetch");
      return new Response(withScripts);
    });
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    await answer;
    await settled();
    await worker.check();
    const cache = await worker.caches.open("graspy-shell-v1");
    expect(await (await cache.match("/"))!.text()).toBe(OLD);
    expect(worker.told).toEqual([]);
  });

  it("does not keep the document when a file comes back as a page", async () => {
    const html = { headers: { "content-type": "text/html" } };
    const worker = startWorker(async (url) =>
      String(url) === "/" ? new Response(withScripts) : new Response(OLD, html),
    );
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    await answer;
    await settled();
    const cache = await worker.caches.open("graspy-shell-v1");
    expect(await (await cache.match("/"))!.text()).toBe(OLD);
    const files = await worker.caches.open("graspy-files-v2");
    expect(await files.match(ORIGIN + entry)).toBeUndefined();
  });
});

describe("the service worker's refusal to keep what is not the app", () => {
  it("keeps a captive portal's page out of the document's copy", async () => {
    const worker = startWorker(page("<html>Sign in to the Wi-Fi</html>"));
    await kept(worker, OLD);
    const { answer, settled } = await worker.open();
    expect(await (await answer).text()).toBe(OLD);
    await settled();
    await worker.check();
    const cache = await worker.caches.open("graspy-shell-v1");
    expect(await (await cache.match("/"))!.text()).toBe(OLD);
    expect(worker.told).toEqual([]);
  });

  it("keeps a script it fetched, so the next ask is answered from the copy", async () => {
    const worker = startWorker(async () => new Response("script"));
    await worker.openFile("/assets/a.js");
    const files = await worker.caches.open("graspy-files-v2");
    expect(await files.match(ORIGIN + "/assets/a.js")).toBeDefined();
  });

  it.each([
    "/sounds/select-v2.wav",
    "/sounds/press-v2.wav",
    "/sounds/correct-v2.wav",
    "/sounds/wrong-v2.wav",
    "/sounds/complete-v2.m4a",
  ])("keeps the cue sound %s, so it plays offline", async (path) => {
    const calls: string[] = [];
    const worker = startWorker(async (url) => {
      calls.push(String(url));
      return new Response("riff", { headers: { "content-type": "audio/wav" } });
    });
    await worker.openFile(path);
    await worker.openFile(path);
    const files = await worker.caches.open("graspy-files-v2");
    expect(await files.match(ORIGIN + path)).toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("deletes the caches of older versions when it takes over, and keeps its own", async () => {
    const worker = startWorker(async () => new Response("{}"));
    await worker.caches.open("graspy-files-v1");
    await worker.caches.open("graspy-files-v2");
    await worker.caches.open("graspy-shell-v1");

    await worker.activate();

    expect(await worker.caches.keys()).toEqual([
      "graspy-files-v2",
      "graspy-shell-v1",
    ]);
  });

  it("leaves the manifest to the network, so a changed one reaches an installed app", async () => {
    const worker = startWorker(async () => new Response("{}"));
    const files = await worker.caches.open("graspy-files-v2");
    const outcome = await Promise.race([
      worker.openFile("/manifest.webmanifest").then(() => "answered"),
      new Promise((resolve) => setTimeout(() => resolve("left alone"), 20)),
    ]);
    expect(outcome).toBe("left alone");
    expect(await files.match(ORIGIN + "/manifest.webmanifest")).toBeUndefined();
  });

  it("does not keep a page answered for a file that is not there, and answers it as missing", async () => {
    const worker = startWorker(
      async () =>
        new Response(OLD, { headers: { "content-type": "text/html" } }),
    );
    const answer = await worker.openFile("/assets/missing.js");
    expect(answer.status).toBe(404);
    const files = await worker.caches.open("graspy-files-v2");
    expect(await files.match(ORIGIN + "/assets/missing.js")).toBeUndefined();
  });
});
