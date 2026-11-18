// The service worker answers the page from its last copy and fetches the newer one behind it
// (public/sw.js). Once loaded, the page asks whether that differed and is told "update-ready". A page the learner has not touched
// yet reloads into the new build at once, so one visit after a deploy is enough; a page in use is
// left alone, and the next visit opens the new build.

export const UPDATE_READY = "update-ready";
const CHECK = "check";
/** Reloads nearer together than this are a loop, not an update. */
export const RELOAD_GAP_MS = 30_000;
const RELOADED_KEY = "graspy.updateReloaded";

export interface Page {
  /** Whether the learner has pressed, tapped or typed on this page. */
  touched: boolean;
  now: number;
  /** When this tab last reloaded for an update; null if it has not. */
  lastReload: number | null;
}

export function shouldReload(page: Page): boolean {
  if (page.touched) return false;
  return page.lastReload === null || page.now - page.lastReload > RELOAD_GAP_MS;
}

function lastReload(): number | null {
  try {
    const kept = Number(window.sessionStorage.getItem(RELOADED_KEY));
    return kept > 0 ? kept : null;
  } catch {
    return null;
  }
}

function keepReload(now: number): void {
  try {
    window.sessionStorage.setItem(RELOADED_KEY, String(now));
  } catch {
    // Storage refused: the gap cannot be kept, and a page the learner touches never reloads.
  }
}

/** Reloads into a new build the worker found, while the page is still untouched. */
export function reloadOnUpdate(): void {
  let touched = false;
  for (const input of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(
      input,
      () => {
        touched = true;
      },
      { once: true, capture: true },
    );
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    if ((event.data as { type?: unknown } | null)?.type !== UPDATE_READY) return;
    const now = Date.now();
    if (!shouldReload({ touched, now, lastReload: lastReload() })) return;
    keepReload(now);
    window.location.reload();
  });
  navigator.serviceWorker.controller?.postMessage({ type: CHECK });
}
