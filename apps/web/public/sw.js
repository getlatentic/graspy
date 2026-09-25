// The app's service worker, so graspy opens without a connection once it has
// opened with one. It answers two kinds of request from this origin: a page,
// which is the one app document, from the network while there is one and
// from its last copy when not; and the build's files, which are hashed and
// never change, from its cache first. Everything else, the API included,
// goes to the network as if it were not here.
"use strict";

const SHELL = "graspy-shell-v1";
const FILES = "graspy-files-v1";
const KEPT = new Set([SHELL, FILES]);
// Every page of the app is this one document.
const APP = "/";
// A deploy leaves the last one's hashed files behind; past this many, the
// oldest go.
const MAX_FILES = 200;

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

const isFile = (url) =>
  url.pathname.startsWith("/assets/") ||
  url.pathname.startsWith("/brand/") ||
  url.pathname === "/favicon.ico" ||
  url.pathname === "/manifest.webmanifest";

async function trimmed(cache) {
  const keys = await cache.keys();
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - MAX_FILES))
      .map((key) => cache.delete(key)),
  );
}

async function page(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(APP, response.clone());
    return response;
  } catch (error) {
    const kept = await cache.match(APP);
    if (kept) return kept;
    throw error;
  }
}

async function file(request) {
  const cache = await caches.open(FILES);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimmed(cache);
  }
  return response;
}

// What the page loaded before this worker controlled it, which it keeps.
async function keep(urls) {
  const shell = await caches.open(SHELL);
  const files = await caches.open(FILES);
  await Promise.all(
    urls.map(async (address) => {
      const url = new URL(address, self.location.origin);
      if (url.origin !== self.location.origin) return;
      const cache = url.pathname === APP ? shell : isFile(url) ? files : null;
      if (!cache || (await cache.match(url.href))) return;
      const response = await fetch(url.href);
      if (response.ok) {
        await cache.put(url.pathname === APP ? APP : url.href, response);
      }
    }),
  );
  await trimmed(files);
}

self.addEventListener("message", (event) => {
  const { type, urls } = event.data || {};
  if (type === "keep" && Array.isArray(urls)) {
    event.waitUntil(keep(urls.filter((url) => typeof url === "string")));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (isFile(url)) event.respondWith(file(request));
});
