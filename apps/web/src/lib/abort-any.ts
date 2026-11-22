/** A signal that aborts when the first of `signals` does, with that signal's reason.
 *  AbortSignal.any needs Chromium 116; the supported floor is Chromium 108. */
export function abortAny(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const first = signals.find((signal) => signal.aborted);
  if (first) return AbortSignal.abort(first.reason);
  const controller = new AbortController();
  const stop = (event: Event) => {
    for (const signal of signals) signal.removeEventListener("abort", stop);
    controller.abort((event.target as AbortSignal).reason);
  };
  for (const signal of signals) signal.addEventListener("abort", stop);
  return controller.signal;
}
