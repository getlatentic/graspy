/** A second request is sent when the first has not answered by then: the host's slow calls are a few in ten, not the next one. */
export const HEDGE_AFTER_MS = 1200;

/**
 * The first answer of an attempt and, if it has not answered by `afterMs`, a second identical one, with the slower given up
 * on; null where neither answers within `timeoutMs`. An attempt that fails at once starts the second at once.
 */
export async function hedged<T>(attempt: (signal: AbortSignal) => Promise<T | null>, afterMs: number, timeoutMs: number, part = "hedged-failed"): Promise<T | null> {
  const stops = [new AbortController(), new AbortController()];
  const deadline = AbortSignal.timeout(timeoutMs);
  const run = (at: 0 | 1) => attempt(AbortSignal.any([stops[at].signal, deadline])).then((value) => value ?? Promise.reject(new Error("no answer")));
  const first = run(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const second = new Promise<T>((resolve, reject) => {
    let started = false;
    const start = () => {
      if (started || deadline.aborted) return;
      started = true;
      run(1).then(resolve, reject);
    };
    timer = setTimeout(start, Math.min(afterMs, timeoutMs));
    first.catch(start);
  });
  // A call that cannot be aborted (the Workers AI binding takes no signal) is given up on at the deadline all the same.
  const expired = new Promise<null>((resolve) => deadline.addEventListener("abort", () => resolve(null), { once: true }));
  try {
    return await Promise.race([Promise.any([first, second]), expired]);
  } catch (error) {
    // A failure is null to the caller and a line here, so an outage reads as one: the reason, never the child's words.
    console.log(JSON.stringify({ part, error: error instanceof AggregateError ? String(error.errors[0]) : String(error) }));
    return null;
  } finally {
    clearTimeout(timer ?? null);
    stops.forEach((stop) => stop.abort());
  }
}

/**
 * A call to a model on Workers AI that is sent a second time when it has not answered by `afterMs`, with the first answer taken;
 * null where neither answers within `timeoutMs` or both fail, which is logged under `part`. Its slow calls are a few in a hundred and four seconds long where
 * the others take a few tenths, and nothing else bounded them.
 */
export function runAi<T>(env: Env, model: string, input: object, { afterMs = HEDGE_AFTER_MS, timeoutMs = 4000, part = "workers-ai-failed" } = {}): Promise<T | null> {
  return hedged<T>(async () => (await env.AI.run(model as never, input as never)) as T, afterMs, timeoutMs, part);
}
