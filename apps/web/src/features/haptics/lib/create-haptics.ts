import type { Output } from "./haptic-device";
import {
  MIN_GAP_MS,
  PRIORITY,
  type Channel,
  type Cue,
} from "./haptic-patterns";

/** Everything a cue depends on, passed in so none of it is read from the page here. */
export interface HapticsDeps {
  outputs: readonly Output[];
  /** Whether a channel may be used now: the learner's switch, and what else keeps it quiet. */
  allows: (channel: Channel) => boolean;
  hidden: () => boolean;
  /** The learner has touched or pressed something on this page. */
  activated: () => boolean;
  /** A monotonic clock in milliseconds. */
  now: () => number;
  /** Wakes what a gesture was needed to start, when a cue is about to come with no gesture (a tap inside a lesson's frame). */
  wake?: () => void;
}

export interface Haptics {
  /** Plays the cue if it is allowed; otherwise does nothing. */
  trigger: (cue: Cue) => void;
  stop: () => void;
  /** Asks the sound to wake if the browser put it to sleep; best effort, as only a gesture is sure to. */
  wake: () => void;
  /** Whether this device can make a cue felt, or heard, at all. */
  supported: (channel: Channel) => boolean;
}

export function createHaptics(deps: HapticsDeps): Haptics {
  let lastAt = -Infinity;
  let lastCue: Cue | null = null;

  // A phone ignores a vibration before the first tap, and a sound cannot start
  // before one; a controller does not mind.
  const reaching = () =>
    deps.outputs.filter(
      (output) =>
        deps.allows(output.channel) &&
        (!output.needsActivation || deps.activated()),
    );

  // Inside the gap only a more important cue gets through, and replaces the last.
  const crowded = (cue: Cue, now: number) =>
    lastCue !== null &&
    now - lastAt < MIN_GAP_MS &&
    PRIORITY[cue] <= PRIORITY[lastCue];

  // Feedback only adds to what the screen shows: a failing output or setting
  // must never stop the action that asked for it, or the other outputs.
  const safely = (work: () => void) => {
    try {
      work();
    } catch {
      // The cue is lost; nothing else is.
    }
  };

  const start = (cue: Cue) => {
    if (deps.hidden()) return;
    const outputs = reaching();
    const now = deps.now();
    if (outputs.length === 0 || crowded(cue, now)) return;
    lastAt = now;
    lastCue = cue;
    for (const output of outputs) safely(() => output.play(cue));
  };

  return {
    trigger: (cue) => safely(() => start(cue)),
    stop: () => {
      for (const output of deps.outputs) safely(() => output.stop());
    },
    wake: () => safely(() => deps.wake?.()),
    supported: (channel) =>
      deps.outputs.some(
        (output) => output.channel === channel && output.available(),
      ),
  };
}
