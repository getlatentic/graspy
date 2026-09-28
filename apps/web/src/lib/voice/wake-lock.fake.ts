// For tests: the browser's Screen Wake Lock, granting or refusing each request.
import { vi } from "vitest";

export function fakeWakeLock(answer: "grant" | "refuse" = "grant") {
  const release = vi.fn(async () => undefined);
  const request = vi.fn(async (_type: "screen") => {
    if (answer === "refuse")
      throw new DOMException("Low battery", "NotAllowedError");
    return { release } as unknown as WakeLockSentinel;
  });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
  return { request, release };
}

/** A browser with no Screen Wake Lock. */
export function noWakeLock() {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: undefined,
  });
}
