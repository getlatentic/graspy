import type { Output } from "./haptic-device";
import { MIN_GAP_MS, type Cue } from "./haptic-patterns";

/** Everything a cue depends on, passed in so none of it is read from the page here. */
export interface HapticsDeps {
  outputs: readonly Output[];
  enabled: () => boolean;
  hidden: () => boolean;
  reducedMotion: () => boolean;
  /** The learner has touched or pressed something on this page. */
  activated: () => boolean;
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

  const allowed = () =>
    deps.enabled() &&
    !deps.reducedMotion() &&
    !deps.hidden() &&
    deps.activated();

  return {
    trigger: (cue) => {
      if (!allowed()) return;
      const now = deps.now();
      if (now - lastAt < MIN_GAP_MS) return;
      lastAt = now;
      for (const output of deps.outputs) output.play(cue);
    },
    stop: () => {
      for (const output of deps.outputs) output.stop();
    },
    supported: () => deps.outputs.some((output) => output.available()),
  };
}
