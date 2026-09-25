import type { ComponentType } from "react";

// Kept off the landing page; prefetched in the app so they open offline.
const pages = {
  onboarding: () => import("@/features/onboarding/pages/onboarding"),
  learnLayout: () => import("@/app/learn/layout"),
  home: () => import("@/app/learn/page"),
  subject: () => import("@/app/learn/subject-page"),
  lesson: () => import("@/app/learn/lesson-page"),
  plan: () => import("@/app/learn/plan-page"),
  subjects: () => import("@/app/learn/subjects-page"),
  you: () => import("@/app/learn/you-page"),
  details: () => import("@/app/learn/details-page"),
  ask: () => import("@/app/learn/ask-page"),
  chat: () => import("@/app/learn/chat-page"),
};

const RELOADED_AT_KEY = "graspy.reloaded-for-stale-chunk";
// Covers the reload and the retried download.
const RETRY_WINDOW_MS = 10_000;

let backgroundDownloads = 0;

// The function form of `lazy`: React Router awaits it, so a failed download
// reaches the error screen, where the object form leaves the page blank.
export function lazyPage(name: keyof typeof pages) {
  return async () => {
    const page: { default: ComponentType } | undefined = await pages[name]();
    // Undefined while the page reloads to fetch the new build.
    if (!page) return new Promise<never>(() => {});
    return { Component: page.default };
  };
}

export async function prefetchPages(
  downloads: Array<() => Promise<unknown>> = Object.values(pages),
): Promise<void> {
  backgroundDownloads += 1;
  try {
    await Promise.allSettled(downloads.map((download) => download()));
  } finally {
    backgroundDownloads -= 1;
  }
}

function reloadedRecently(now: number): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(RELOADED_AT_KEY));
    return now - at < RETRY_WINDOW_MS;
  } catch {
    return false;
  }
}

function recordReload(now: number): void {
  try {
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    // Storage denied: one extra reload is the worst case.
  }
}

// A deploy removes the old build's files, so an older tab reloads once: never
// offline (the browser's offline page would show), nor right after a reload.
export function recoverFromStaleChunk(event: Event, now = Date.now()): boolean {
  if (backgroundDownloads > 0) return false;
  if (!navigator.onLine || reloadedRecently(now)) return false;
  recordReload(now);
  event.preventDefault();
  window.location.reload();
  return true;
}

export function listenForStaleChunks(): void {
  window.addEventListener("vite:preloadError", (event) => {
    recoverFromStaleChunk(event);
  });
}
