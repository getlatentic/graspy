// The sandbox origin's service worker, so every view opens without a
// connection once any view has opened with one. A view runs on this origin
// and can write its caches, so nothing a page could have written is trusted:
// the worker builds the sandbox's two pages from this script alone, and
// answers a view file from its cache only when the file's digest, built into
// this script, matches. The browser keeps this script with the registration,
// where no page can write.
"use strict";

// Written by the views' build: each file of the current build, with the
// base64 SHA-256 of its bytes. No other file is ever answered from a cache.
const FILES = __FILES__;
// Written by the server as it serves this script: its origin, the hosts
// that may frame the sandbox, and each page with its policy, whose
// frame-ancestors carries hostMark until a host is checked.
const SERVER = __SERVER__;

const ASSETS = "graspy-view-assets-v2";
const NOT_A_HOST = "This page frames views for graspy only.";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== ASSETS)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// One wildcard stands for exactly one subdomain label, as the server's CORS
// list reads it.
function listed(entry, host) {
  const [head, tail] = entry.split("*");
  if (tail === undefined) return entry === host;
  const label = host.slice(head.length, host.length - tail.length);
  return (
    host.length > head.length + tail.length &&
    host.startsWith(head) &&
    host.endsWith(tail) &&
    !label.includes(".")
  );
}

function allowed(host) {
  let origin;
  try {
    origin = new URL(host).origin;
  } catch {
    return false;
  }
  return (
    origin === host &&
    host !== SERVER.origin &&
    SERVER.hosts.some((entry) => listed(entry, host))
  );
}

function page(url, { body, policy }) {
  const host = url.searchParams.get("host") ?? "";
  if (!allowed(host)) {
    return new Response(NOT_A_HOST, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": policy.split(SERVER.hostMark).join(host),
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

async function intact(response, digest) {
  const bytes = await response.clone().arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return btoa(String.fromCharCode(...hash)) === digest;
}

async function asset(event, path) {
  const cache = await caches.open(ASSETS);
  const kept = await cache.match(path);
  if (kept && (await intact(kept, FILES[path]))) return kept;
  if (kept) event.waitUntil(cache.delete(path).catch(() => undefined));
  const response = await fetch(event.request);
  if (response.ok && (await intact(response, FILES[path]))) {
    // Best effort: a full quota never fails a file the network gave.
    const stored = cache.put(path, response.clone());
    event.waitUntil(stored.catch(() => undefined));
  }
  return response;
}

// Caches every view's files, not only the ones a page loaded, and drops
// whatever else the cache holds. A file that fails is fetched on the next
// pass; a copy that is no longer intact is replaced as it is asked for.
async function precached() {
  const cache = await caches.open(ASSETS);
  const paths = Object.keys(FILES);
  await Promise.allSettled(
    paths.map(async (path) => {
      if (await cache.match(path)) return;
      const response = await fetch(path);
      if (response.ok && (await intact(response, FILES[path])))
        await cache.put(path, response);
    }),
  );
  const current = new Set(
    paths.map((path) => new URL(path, self.location.origin).href),
  );
  const keys = await cache.keys();
  await Promise.allSettled(
    keys.filter((key) => !current.has(key.url)).map((key) => cache.delete(key)),
  );
}

// Every sandbox on the page asks at once; one pass at a time serves them.
let precaching = null;

function precache() {
  precaching ??= precached().finally(() => {
    precaching = null;
  });
  return precaching;
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "precache") event.waitUntil(precache());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (Object.hasOwn(SERVER.pages, url.pathname))
    event.respondWith(page(url, SERVER.pages[url.pathname]));
  else if (Object.hasOwn(FILES, url.pathname))
    event.respondWith(asset(event, url.pathname));
});
