// The sandbox origin's service worker, so every view opens without a
// connection once any view has opened with one. It controls the sandbox
// proxy page and the page the proxy writes each view into, and answers two
// kinds of request: those pages, from the network while there is one and
// from their last copy when not; and the views' scripts, styles and fonts,
// which are hashed and never change, from its cache first.
"use strict";

const PAGES = "graspy-sandbox-pages-v1";
const ASSETS = "graspy-view-assets-v1";
const KEPT = new Set([PAGES, ASSETS]);
const PAGE_PATHS = new Set(["/ui-sandbox", "/ui-sandbox-frame"]);
const ASSET_PATH = "/views/assets/";
// Every view's files in the current build, written by the views' build.
const LIST = "/views/precache.json";
// The apps keep pages from past builds, which need that build's files, and
// which pages they keep is not visible here: past builds' files stay, the
// longest unused going past this many. The current build's files always stay.
// Trimming happens only in a pass that has the current list.
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

function isAsset(url) {
  return (
    url.origin === self.location.origin && url.pathname.startsWith(ASSET_PATH)
  );
}

async function trimmed(cache, current) {
  const keys = await cache.keys();
  const past = keys.filter((key) => !current.has(key.url));
  await Promise.all(
    past
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

async function asset(event) {
  const { request } = event;
  const cache = await caches.open(ASSETS);
  const kept = await cache.match(request);
  if (kept) {
    // Put again, it goes last in the cache's order: the longest unused go
    // first. The view has its file whether or not that is stored.
    event.waitUntil(cache.put(request, kept.clone()).catch(() => undefined));
    return kept;
  }
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// Caches what a page loaded before this worker controlled it.
async function keep(urls) {
  await Promise.all(
    urls.map(async (address) => {
      const url = new URL(address);
      if (url.origin !== self.location.origin) return;
      const name = PAGE_PATHS.has(url.pathname)
        ? PAGES
        : isAsset(url)
          ? ASSETS
          : null;
      if (!name) return;
      const cache = await caches.open(name);
      if (await cache.match(url.href)) return;
      const response = await fetch(url.href);
      if (response.ok) await cache.put(url.href, response);
    }),
  );
}

async function listed() {
  const response = await fetch(LIST, { cache: "no-cache" });
  if (!response.ok) return null;
  const files = await response.json();
  if (!Array.isArray(files)) return null;
  return files
    .filter((file) => typeof file === "string")
    .map((file) => new URL(file, self.location.origin))
    .filter(isAsset)
    .map((url) => url.href);
}

// Caches the files of every view, not only the ones this page loaded. Best
// effort: a file that fails is fetched on the next pass.
async function precached() {
  const files = await listed().catch(() => null);
  if (!files) return;
  const cache = await caches.open(ASSETS);
  await Promise.allSettled(
    files.map(async (file) => {
      if (await cache.match(file)) return;
      const response = await fetch(file);
      if (response.ok) await cache.put(file, response);
    }),
  );
  await trimmed(cache, new Set(files));
}

// Every sandbox on the page asks at once; one pass serves them all.
let precaching = null;

function precache() {
  if (!precaching) {
    precaching = precached().finally(() => {
      precaching = null;
    });
  }
  return precaching;
}

self.addEventListener("message", (event) => {
  const { type, urls } = event.data || {};
  if (type === "keep" && Array.isArray(urls)) {
    event.waitUntil(
      keep(urls.filter((url) => typeof url === "string")).finally(precache),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (PAGE_PATHS.has(url.pathname)) event.respondWith(page(event.request));
  else if (isAsset(url)) event.respondWith(asset(event));
});
