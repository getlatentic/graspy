/** A hold that was never released ends by itself after this long: longer than a take (110 s) and a teacher's line. */
export const HOLD_LIMIT_MS = 5 * 60_000;

/** When each hold in force ends, at the latest. */
const holds = new Set<{ expires: number }>();
const listeners = new Set<() => void>();

const now = () => performance.now();

function dropExpired() {
  for (const hold of holds) if (hold.expires <= now()) holds.delete(hold);
}

/**
 * Asks the app's own sounds to keep quiet (the teacher's voice is playing, the
 * microphone is open) until the returned function is called. Holds add up.
 * Taking a hold calls the `onHold` listeners at once, so a cue already
 * sounding is cut and not only new ones kept out. A hold never lasts longer
 * than HOLD_LIMIT_MS, so one that is left over cannot mute the app for good.
 */
export function holdQuiet(): () => void {
  const hold = { expires: now() + HOLD_LIMIT_MS };
  holds.add(hold);
  for (const listener of listeners) listener();
  return () => void holds.delete(hold);
}

export const isQuiet = () => {
  dropExpired();
  return holds.size > 0;
};

/** Calls `listener` whenever a hold is taken. Returns the function that stops it. */
export function onHold(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
