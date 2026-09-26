import { readFileSync } from "node:fs";

// The sandbox's service worker, run against a cache and a network kept in
// memory.
const SOURCE = readFileSync(
  new URL("../../public/views/ui-sandbox-sw.js", import.meta.url),
  "utf-8",
);

export const ORIGIN = "https://api.graspy.test";

type Handler = (event: object) => void;

class MemoryCache {
  // Insertion order, as a browser's cache keeps it.
  readonly entries = new Map<string, Response>();

  async match(key: Request | string) {
    return this.entries.get(url(key))?.clone();
  }

  async put(key: Request | string, response: Response) {
    this.entries.delete(url(key));
    this.entries.set(url(key), response);
  }

  async delete(key: Request | string) {
    return this.entries.delete(url(key));
  }

  async keys() {
    return [...this.entries.keys()].map((address) => new Request(address));
  }
}

function url(key: Request | string): string {
  return new URL(typeof key === "string" ? key : key.url, ORIGIN).href;
}

export class SandboxWorker {
  readonly caches = new Map<string, MemoryCache>();
  readonly fetched: { url: string; cache?: RequestCache }[] = [];
  // What the network answers; a path it has no answer for is a 404.
  readonly network = new Map<string, () => Response>();
  online = true;
  private readonly handlers = new Map<string, Handler>();

  constructor() {
    const self = {
      location: new URL(`${ORIGIN}/ui-sandbox-sw.js`),
      addEventListener: (type: string, handler: Handler) =>
        this.handlers.set(type, handler),
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
    };
    const caches = {
      open: async (name: string) => this.cache(name),
      keys: async () => [...this.caches.keys()],
      delete: async (name: string) => this.caches.delete(name),
    };
    new Function("self", "caches", "fetch", SOURCE)(self, caches, this.fetch);
  }

  cache(name: string): MemoryCache {
    const cache = this.caches.get(name) ?? new MemoryCache();
    this.caches.set(name, cache);
    return cache;
  }

  assets(): string[] {
    return [...this.cache("graspy-view-assets-v1").entries.keys()].map(
      (address) => new URL(address).pathname,
    );
  }

  serve(path: string, body: string) {
    this.network.set(`${ORIGIN}${path}`, () => new Response(body));
  }

  list(paths: unknown) {
    this.serve("/views/precache.json", JSON.stringify(paths));
  }

  // What the sandbox page posts once its view has loaded.
  async keep(...urls: string[]) {
    await this.dispatch("message", { data: { type: "keep", urls } });
  }

  // What the view's page asks for, and what it is answered.
  async request(address: string): Promise<Response | undefined> {
    let answer: Promise<Response> | undefined;
    await this.dispatch("fetch", {
      request: new Request(address),
      respondWith: (response: Promise<Response>) => (answer = response),
    });
    return answer;
  }

  async dispatch(type: string, fields: object) {
    const waits: Promise<unknown>[] = [];
    this.handlers.get(type)?.({
      ...fields,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    });
    await Promise.allSettled(waits);
  }

  private fetch = async (input: Request | string, init?: RequestInit) => {
    const address = url(input);
    this.fetched.push({ url: address, cache: init?.cache });
    if (!this.online) throw new TypeError("Failed to fetch");
    const answer = this.network.get(address);
    return answer ? answer() : new Response("", { status: 404 });
  };
}
