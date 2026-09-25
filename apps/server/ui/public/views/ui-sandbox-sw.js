// The sandbox origin's service worker, so a view opens without a connection
// once it has opened with one. It controls the sandbox proxy page and, by
// inheritance, the view the proxy writes into its frame, and answers two
// kinds of request: the proxy page, from the network while there is one and
// from its last copy when not; and the views' scripts, styles and fonts,
// which are hashed and never change, from its cache first.
"use strict";

const PAGES = "graspy-sandbox-pages-v1";
const ASSETS = "graspy-view-assets-v1";
const KEPT = new Set([PAGES, ASSETS]);
// A deploy leaves the last one's hashed files behind; past this many, the
// oldest go.
const MAX_ASSETS = 120;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !KEPT.has(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimmed(cache) {
  const keys = await cache.keys();
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - MAX_ASSETS))
      .map((key) => cache.delete(key)),
  );
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const kept = await cache.match(request);
    if (kept) return kept;
    throw error;
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimmed(cache);
  }
  return response;
}

// Caches what a page loaded before this worker controlled it.
async function keep(urls) {
  await Promise.all(
    urls.map(async (address) => {
      const url = new URL(address);
      if (url.origin !== self.location.origin) return;
      const name =
        url.pathname === "/ui-sandbox"
          ? PAGES
          : url.pathname.startsWith("/views/assets/")
            ? ASSETS
            : null;
      if (!name) return;
      const cache = await caches.open(name);
      if (await cache.match(url.href)) return;
      const response = await fetch(url.href);
      if (response.ok) await cache.put(url.href, response);
    }),
  );
  await trimmed(await caches.open(ASSETS));
}

self.addEventListener("message", (event) => {
  const { type, urls } = event.data || {};
  if (type === "keep" && Array.isArray(urls)) {
    event.waitUntil(keep(urls.filter((url) => typeof url === "string")));
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (url.pathname === "/ui-sandbox") event.respondWith(page(event.request));
  else if (url.pathname.startsWith("/views/assets/"))
    event.respondWith(asset(event.request));
});
