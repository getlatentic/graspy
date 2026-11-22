// The app's service worker, so graspy opens at once, and without a connection
// once it has opened with one. It answers two kinds of request from this
// origin: a page, which is the one app document, from its last copy at once
// while it asks the network for a newer one; and the build's files and the cue
// sounds, which never change under one name, from its cache first. Everything else, the API
// included, goes to the network as if it were not here.
//
// A page answered from the last copy may be a deploy behind. When the network's
// document differs the copy is replaced, and the page, which asks once it has
// loaded, is told: one the learner has not touched reloads into the new build,
// and any other opens it on the next visit (src/lib/app-update.ts).
"use strict";

const SHELL = "graspy-shell-v1";
// v2: v1 also held /manifest.webmanifest, which never changes again once kept.
const FILES = "graspy-files-v2";
const KEPT = new Set([SHELL, FILES]);
// Every page of the app is this one document.
const APP = "/";
// A deploy leaves the last one's hashed files behind; past this many, the
// oldest go.
const MAX_FILES = 200;
// What the page is told when the document changed; src/lib/app-update.ts listens for it.
const UPDATE_READY = "update-ready";

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
  url.pathname.startsWith("/sounds/") ||
  url.pathname === "/favicon.ico";

async function trimmed(cache) {
  const keys = await cache.keys();
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - MAX_FILES))
      .map((key) => cache.delete(key)),
  );
}

// Whether the document the network has now differs from the copy kept, as the page last answered
// found it; the page asks once it is loaded (see "check" below).
let latestChanged = Promise.resolve(false);

// The files a document names under /assets: its entry script and the ones it preloads.
const NAMED_FILE = /(?:src|href)="(\/assets\/[^"]+)"/g;

// What the app's document always holds; a captive portal's page or an error page does not.
const APP_MARKER = 'id="root"';

// Pages answers 200 with the document for a file it does not have, and a captive portal answers
// 200 with its own page; neither may be kept under a file's address, where it would stay.
const isFileReply = (response) =>
  response.ok &&
  !(response.headers.get("content-type") || "").includes("text/html");

// A new build's startup files, kept before its document is, so the reload (or an offline visit)
// finds them here and does not fetch them cold. One that cannot be kept fails the whole set: the
// copy of the document stays the old build's, whose files are all here.
async function precache(html) {
  const files = await caches.open(FILES);
  const names = [...html.matchAll(NAMED_FILE)].map(([, name]) => name);
  await Promise.all(
    names.map(async (name) => {
      const url = new URL(name, self.location.origin).href;
      if (await files.match(url)) return;
      const response = await fetch(url);
      if (!isFileReply(response)) throw new Error(`${name} could not be kept`);
      await files.put(url, response);
    }),
  );
  await trimmed(files);
}

// The document as the network has it now. The copy is replaced when it differs from the one kept,
// once the new build's startup files are kept; a reply that is not the app's document is not kept.
async function refresh(cache, kept) {
  const response = await fetch(APP, { cache: "no-cache" });
  if (!response.ok) return { response, changed: false };
  const html = await response.clone().text();
  if (!html.includes(APP_MARKER)) return { response, changed: false };
  const changed = !!kept && (await kept.text()) !== html;
  if (changed) await precache(html);
  if (!kept || changed) await cache.put(APP, response.clone());
  return { response, changed };
}

async function page(event) {
  const cache = await caches.open(SHELL);
  const kept = await cache.match(APP);
  const refreshing = refresh(cache, kept && kept.clone());
  if (!kept) return (await refreshing).response;
  // The learner does not wait for the network; a failed refresh leaves the copy as it is.
  latestChanged = refreshing.then(({ changed }) => changed).catch(() => false);
  event.waitUntil(latestChanged);
  return kept;
}

async function file(request) {
  const cache = await caches.open(FILES);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (isFileReply(response)) {
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
      if (url.pathname === APP) {
        const html = await response.clone().text();
        if (response.ok && html.includes(APP_MARKER))
          await cache.put(APP, response);
      } else if (isFileReply(response)) {
        await cache.put(url.href, response);
      }
    }),
  );
  await trimmed(files);
}

self.addEventListener("message", (event) => {
  const { type, urls } = event.data || {};
  // The page asks, rather than being told, because a page still loading may not be there to hear.
  if (type === "check") {
    event.waitUntil(
      latestChanged.then((changed) => {
        if (changed) event.source.postMessage({ type: UPDATE_READY });
      }),
    );
  }
  if (type === "keep" && Array.isArray(urls)) {
    event.waitUntil(keep(urls.filter((url) => typeof url === "string")));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(event));
  else if (isFile(url)) event.respondWith(file(request));
});
