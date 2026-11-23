// The app's service worker, so graspy opens without a connection once it has opened with one. It
// answers two kinds of request from this origin: a page, which is the one app document, and the
// build's files and the cue sounds, which never change under one name. Everything else, the API
// included, goes to the network as if it were not here.
//
// A page is answered by the network first, for a moment (NAVIGATION_WAIT_MS): the document it
// gets is the build now deployed, so a deploy never meets a page that asks for files the host no
// longer has. Only when the network is offline, refuses, or is slower than that does the last
// copy answer; that copy may be a deploy behind, and when the network's document then arrives
// and differs, the page, which asks once it has loaded, is told: one the learner has not touched
// reloads into the new build, and any other opens it on the next visit (src/lib/app-update.ts).
// A reload waits longer (RELOAD_WAIT_MS), since it is how a page gets off a build whose files are gone.
//
// A file is answered from the cache first, and kept as it passes. A file the host no longer has
// is answered as missing, not with the app's page, so the page that asked sees it fail (see the
// boot script in index.html and src/app/page-chunks.ts, which reload onto the new build).
"use strict";

const SHELL = "graspy-shell-v1";
// v2: v1 also held /manifest.webmanifest, which never changes again once kept.
const FILES = "graspy-files-v2";
const KEPT = new Set([SHELL, FILES]);
// Every page of the app is this one document.
const APP = "/";
// How long a page waits for the network's document before the last copy answers instead.
const NAVIGATION_WAIT_MS = 2000;
// A reload (the browser sets the request's cache mode to "no-cache" or "reload") is how a page
// gets onto a new build after a file of the old one failed, and how a learner asks for the
// newest. Answering it with the copy that just failed would send the page round again, so it
// waits longer for the network before the copy may answer.
const RELOAD_WAIT_MS = 10000;
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

// One download of a file at a time: the page asking for a startup file while the worker keeps the
// same one shares it, and each gets its own copy of the answer. The download is the worker's own
// fetch of the address, not the first asker's request, so that asker leaving (a page that
// closes, a request it aborts) does not end the download the others wait on.
const downloads = new Map();
function download(request) {
  const url = typeof request === "string" ? request : request.url;
  let pending = downloads.get(url);
  if (!pending) {
    pending = fetch(url).finally(() => downloads.delete(url));
    downloads.set(url, pending);
  }
  return pending.then((response) => response.clone());
}

// Whether a deploy's document, as the network has it now, differs from the copy kept, by the page
// the answer went to: the page asks once it is loaded (see "check" below). Each navigation has its
// own, so one page's answer is never told to another; the oldest go past MAX_PAGES.
const MAX_PAGES = 20;
const latestChanged = new Map();
function expectChange(clientId, changed) {
  latestChanged.delete(clientId);
  latestChanged.set(clientId, changed);
  if (latestChanged.size > MAX_PAGES)
    latestChanged.delete(latestChanged.keys().next().value);
}

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
      const response = await download(url);
      if (!isFileReply(response)) throw new Error(`${name} could not be kept`);
      await files.put(url, response);
    }),
  );
  await trimmed(files);
}

// The document as the network has it now, with a copy to keep. Rejects for a reply that is not the
// app's document: offline, an error, or a captive portal's page.
async function latest(kept) {
  const response = await fetch(APP, { cache: "no-cache" });
  if (!response.ok) throw new Error(`The document answered ${response.status}`);
  const html = await response.clone().text();
  if (!html.includes(APP_MARKER)) throw new Error("Not the app's document");
  const changed = !!kept && (await kept.text()) !== html;
  return { response, copy: response.clone(), html, changed, first: !kept };
}

// Keeps the network's document in place of the copy once the files it names are kept.
async function remember(cache, { copy, html, changed, first }) {
  if (changed) await precache(html);
  if (first || changed) await cache.put(APP, copy);
  return changed;
}

const after = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function page(event) {
  const cache = await caches.open(SHELL);
  const kept = await cache.match(APP);
  const found = latest(kept && kept.clone());
  const changed = found.then((now) => remember(cache, now)).catch(() => false);
  event.waitUntil(changed);
  if (!kept) return (await found).response;
  // The learner waits only a moment for the network; a failed answer leaves the copy as it is.
  const reload =
    event.request.cache === "no-cache" || event.request.cache === "reload";
  const now = await Promise.race([
    found.catch(() => null),
    after(reload ? RELOAD_WAIT_MS : NAVIGATION_WAIT_MS),
  ]);
  // The page is on the network's build already, so there is nothing to reload into.
  expectChange(
    event.resultingClientId,
    now ? changed.then(() => false) : changed,
  );
  return now ? now.response : kept;
}

async function file(request) {
  const cache = await caches.open(FILES);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await download(request);
  if (isFileReply(response)) {
    await cache.put(request, response.clone());
    await trimmed(cache);
    return response;
  }
  // The host's page where a file should be: the file is gone.
  return response.ok ? new Response(null, { status: 404 }) : response;
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
      const response = await download(url.href);
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
      (latestChanged.get(event.source.id) || Promise.resolve(false)).then(
        (changed) => {
          if (changed) event.source.postMessage({ type: UPDATE_READY });
        },
      ),
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
