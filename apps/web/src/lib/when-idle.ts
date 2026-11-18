// Work that no first screen waits on starts after the page has loaded and the browser has a
// moment free, so it does not queue behind the requests the screen is waiting for.

/** The longest the browser may keep idle work waiting. */
const IDLE_TIMEOUT_MS = 2_000;
/** Where there is no idle callback (Safari), a short pause after the load does the same. */
const FALLBACK_MS = 300;

export function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const settle = () => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => resolve(), {
          timeout: IDLE_TIMEOUT_MS,
        });
      } else {
        setTimeout(resolve, FALLBACK_MS);
      }
    };
    if (typeof document === "undefined" || document.readyState === "complete") {
      settle();
    } else {
      window.addEventListener("load", settle, { once: true });
    }
  });
}
