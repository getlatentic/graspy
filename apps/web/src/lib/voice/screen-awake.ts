/**
 * Keeps the screen on until the returned function is called. A take ends when the page is hidden, so a screen
 * timing out part way through a long recitation would end the child's answer for them. Where the browser has no
 * Screen Wake Lock, or refuses one (no secure context, low battery), the screen keeps its own timeout.
 */
export function keepScreenOn(): () => void {
  let released = false;
  let lock: WakeLockSentinel | null = null;
  navigator.wakeLock?.request("screen").then(
    (granted) => {
      if (released) void granted.release();
      else lock = granted;
    },
    () => undefined,
  );
  return () => {
    released = true;
    void lock?.release();
    lock = null;
  };
}
