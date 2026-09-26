import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// The sandbox's service worker, run against a cache and a network kept in
// memory, with the digests its build writes and the pages its server writes.
const SOURCE = readFileSync(
  new URL("./ui-sandbox-sw.js", import.meta.url),
  "utf-8",
);

export const ORIGIN = "https://api.graspy.test";
export const HOST = "https://graspy.test";
export const ASSETS = "graspy-view-assets-v2";
export const SERVER = {
  origin: ORIGIN,
  hosts: [HOST, "https://*.graspy.pages.dev"],
  hostMark: "{host}",
  pages: {
    "/ui-sandbox": { body: "proxy page", policy: "frame-ancestors {host}" },
    "/ui-sandbox-frame": {
      body: "frame page",
      policy: "frame-ancestors 'self' {host}",
    },
  },
};

type Handler = (event: object) => void;

class MemoryCache {
  readonly entries = new Map<string, Response>();
  // What storing fails with, such as a full quota.
  refusal: Error | null = null;

  async match(key: Request | string) {
    return this.entries.get(url(key))?.clone();
  }

  async put(key: Request | string, response: Response) {
    if (this.refusal) throw this.refusal;
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

const digest = (body: string) =>
  createHash("sha256").update(body).digest("base64");

export class SandboxWorker {
  readonly caches = new Map<string, MemoryCache>();
  readonly fetched: string[] = [];
  // What the network answers; a path it has no answer for is a 404.
  readonly network = new Map<string, () => Response>();
  online = true;
  private readonly handlers = new Map<string, Handler>();

  // `files`: each listed path and the body its build wrote.
  constructor(files: Record<string, string>) {
    const listed = Object.fromEntries(
      Object.entries(files).map(([path, body]) => [path, digest(body)]),
    );
    for (const [path, body] of Object.entries(files)) this.serve(path, body);
    const source = SOURCE.replace("__FILES__", JSON.stringify(listed)).replace(
      "__SERVER__",
      JSON.stringify(SERVER),
    );
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
    new Function("self", "caches", "fetch", source)(self, caches, this.fetch);
  }

  cache(name: string): MemoryCache {
    const cache = this.caches.get(name) ?? new MemoryCache();
    this.caches.set(name, cache);
    return cache;
  }

  assets(): string[] {
    return [...this.cache(ASSETS).entries.keys()].map(
      (address) => new URL(address).pathname,
    );
  }

  // What a view on this origin can do: write the worker's caches.
  async plant(name: string, path: string, body: string) {
    await this.cache(name).put(path, new Response(body));
  }

  serve(path: string, body: string) {
    this.network.set(`${ORIGIN}${path}`, () => new Response(body));
  }

  // What the sandbox page posts once the worker is ready.
  async precache() {
    await this.dispatch("message", { data: { type: "precache" } });
  }

  async activate() {
    await this.dispatch("activate", {});
  }

  // What a page asks for, and what it is answered; undefined when the
  // worker leaves it to the network.
  async request(address: string): Promise<Response | undefined> {
    let answer: Promise<Response> | undefined;
    await this.dispatch(
      "fetch",
      { request: new Request(address) },
      (response) => {
        answer = response;
      },
    );
    return answer;
  }

  // Settles once all the event's work has, as a browser keeps the worker
  // alive: its answer, and whatever it waits on, added until then.
  async dispatch(
    type: string,
    fields: object,
    answered?: (response: Promise<Response>) => void,
  ) {
    const waits: Promise<unknown>[] = [];
    this.handlers.get(type)?.({
      ...fields,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (response: Promise<Response>) => {
        waits.push(response);
        answered?.(response);
      },
    });
    for (let settled = 0; settled < waits.length;) {
      const pending = waits.slice(settled);
      settled = waits.length;
      await Promise.allSettled(pending);
    }
  }

  private fetch = async (input: Request | string) => {
    const address = url(input);
    this.fetched.push(address);
    if (!this.online) throw new TypeError("Failed to fetch");
    const answer = this.network.get(address);
    return answer ? answer() : new Response("", { status: 404 });
  };
}
