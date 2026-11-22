import type { Output } from "./haptic-device";
import { MIN_GAP_MS, PRIORITY, type Cue } from "./haptic-patterns";

/** Everything a cue depends on, passed in so none of it is read from the page here. */
export interface HapticsDeps {
  outputs: readonly Output[];
  enabled: () => boolean;
  hidden: () => boolean;
  reducedMotion: () => boolean;
  /** The learner has touched or pressed something on this page. */
  activated: () => boolean;
  /** A monotonic clock in milliseconds. */
  now: () => number;
}

export interface Haptics {
  /** Plays the cue if it is allowed; otherwise does nothing. */
  trigger: (cue: Cue) => void;
  stop: () => void;
  /** Whether this device can make a cue felt at all. */
  supported: () => boolean;
}

export function createHaptics(deps: HapticsDeps): Haptics {
  let lastAt = -Infinity;
  let lastCue: Cue | null = null;

  const open = () => deps.enabled() && !deps.reducedMotion() && !deps.hidden();

  // A phone ignores a vibration before the first tap; a controller does not mind.
  const felt = () =>
    deps.outputs.filter(
      (output) => !output.needsActivation || deps.activated(),
    );

  // Inside the gap only a more important cue gets through, and replaces the last.
  const crowded = (cue: Cue, now: number) =>
    lastCue !== null &&
    now - lastAt < MIN_GAP_MS &&
    PRIORITY[cue] <= PRIORITY[lastCue];

  return {
    trigger: (cue) => {
      if (!open()) return;
      const outputs = felt();
      const now = deps.now();
      if (outputs.length === 0 || crowded(cue, now)) return;
      lastAt = now;
      lastCue = cue;
      for (const output of outputs) output.play(cue);
    },
    stop: () => {
      for (const output of deps.outputs) output.stop();
    },
    supported: () => deps.outputs.some((output) => output.available()),
  };
}
