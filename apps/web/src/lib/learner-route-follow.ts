import { askRoute, routeKey } from "@/lib/learner-route";
import type { ClassDetails } from "@/lib/voice/voice-learner";

// A class with no answer, from the server or kept from an earlier visit, is asked again
// until one comes: until then the app cannot tell whether to make a slide plan.

/** Longer each time, then every half minute. */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

export type Wait = (ms: number, stop: AbortSignal) => Promise<void>;

interface Following {
  followers: number;
  stop: AbortController;
}

const following = new Map<string, Following>();

const retryDelay = (attempt: number) =>
  RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];

/** Over after the delay, when the device comes back online, or when stopped; at once when
 * already stopped, since an abort that has happened is never heard again. */
export function waitToAskAgain(ms: number, stop: AbortSignal): Promise<void> {
  if (stop.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const over = () => {
      clearTimeout(timer);
      window.removeEventListener("online", over);
      stop.removeEventListener("abort", over);
      resolve();
    };
    const timer = setTimeout(over, ms);
    window.addEventListener("online", over);
    stop.addEventListener("abort", over);
  });
}

async function askUntilAnswered(
  details: ClassDetails,
  stop: AbortSignal,
  wait: Wait,
): Promise<void> {
  for (let attempt = 0; !stop.aborted; attempt += 1) {
    if ((await askRoute(details)) !== null) return;
    await wait(retryDelay(attempt), stop);
  }
}

function startFollowing(
  key: string,
  details: ClassDetails,
  wait: Wait,
): Following {
  const entry: Following = { followers: 0, stop: new AbortController() };
  following.set(key, entry);
  void askUntilAnswered(details, entry.stop.signal, wait).finally(() => {
    if (following.get(key) === entry) following.delete(key);
  });
  return entry;
}

/** Asks the server for the class's route, again until there is an answer, while anyone
 * follows it; everyone following one class shares the asking. Returns the way to stop. */
export function followRoute(
  details: ClassDetails,
  wait: Wait = waitToAskAgain,
): () => void {
  const key = routeKey(details);
  const entry = following.get(key) ?? startFollowing(key, details, wait);
  entry.followers += 1;
  return () => {
    entry.followers -= 1;
    if (entry.followers > 0) return;
    entry.stop.abort();
    if (following.get(key) === entry) following.delete(key);
  };
}
