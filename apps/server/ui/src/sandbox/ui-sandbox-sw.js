// One build's sandbox worker, registered under that build's sandbox,
// /ui-sandbox/<build>/, so a view opens without a connection. A view runs on
// this origin and can write its caches, so nothing a page could have written
// is trusted: the worker builds the sandbox's two pages from this script
// alone, and answers one of the build's files from its cache only when the
// file's digest, built into this script, matches. A page kept from an earlier
// build opens under the worker that build registered, which the browser keeps
// with its script, where no page can write.
"use strict";

// Written by the views' build: each file of this build, with the base64
// SHA-256 of its bytes. No other file is ever answered from a cache.
const FILES = __FILES__;
// Written by the server as it serves this script: its origin, the hosts that
// may frame the sandbox, this build's sandbox path, and each page with its
// policy, whose frame-ancestors carries hostMark until a host is checked.
const SERVER = __SERVER__;

// The sandbox page drops the caches of builds no kept page needs by this name.
const FILES_CACHE = `graspy-view-files:${SERVER.scope}`;
const NOT_A_HOST = "This page frames views for graspy only.";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

// Best effort: a full quota never fails a file the network gave.
async function stored(cache, path, response) {
  try {
    await cache.put(path, response);
    return true;
  } catch {
    return false;
  }
}

async function file(event, path) {
  const cache = await caches.open(FILES_CACHE);
  const kept = await cache.match(path);
  if (kept && (await intact(kept, FILES[path]))) return kept;
  if (kept) event.waitUntil(cache.delete(path).catch(() => undefined));
  const response = await fetch(event.request);
  if (response.ok && (await intact(response, FILES[path]))) {
    event.waitUntil(stored(cache, path, response.clone()));
  }
  return response;
}

async function keptIntact(cache, path) {
  const kept = await cache.match(path);
  return Boolean(kept) && (await intact(kept, FILES[path]));
}

// Caches every file of the build, not only the ones a page loaded, and drops
// whatever else this cache holds: whether every file is kept.
async function keptAll() {
  const cache = await caches.open(FILES_CACHE);
  const paths = Object.keys(FILES);
  const kept = await Promise.all(
    paths.map(async (path) => {
      if (await keptIntact(cache, path)) return true;
      try {
        const response = await fetch(path);
        return (
          response.ok &&
          (await intact(response, FILES[path])) &&
          (await stored(cache, path, response))
        );
      } catch {
        return false;
      }
    }),
  );
  const current = new Set(
    paths.map((path) => new URL(path, self.location.origin).href),
  );
  const keys = await cache.keys();
  await Promise.allSettled(
    keys.filter((key) => !current.has(key.url)).map((key) => cache.delete(key)),
  );
  return kept.every(Boolean);
}

// Every sandbox that asks at once is answered by one pass.
let keeping = null;

function keepAll() {
  keeping ??= keptAll().finally(() => {
    keeping = null;
  });
  return keeping;
}

self.addEventListener("message", (event) => {
  const [port] = event.ports ?? [];
  if (event.data?.type !== "keep" || !port) return;
  event.waitUntil(
    keepAll()
      .catch(() => false)
      .then((kept) => port.postMessage({ kept })),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (Object.hasOwn(SERVER.pages, url.pathname))
    event.respondWith(page(url, SERVER.pages[url.pathname]));
  else if (Object.hasOwn(FILES, url.pathname))
    event.respondWith(file(event, url.pathname));
});
