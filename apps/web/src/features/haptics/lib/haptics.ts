import { whenIdle } from "@/lib/when-idle";
import { isQuiet, onHold } from "@/lib/voice/quiet";
import { fetchBytes } from "./fetch-bytes";
import { createHaptics } from "./create-haptics";
import { vibrationOutput } from "./haptic-device";
import { gamepadOutput } from "./haptic-gamepad";
import { getSettings } from "./haptic-settings";
import { FETCH_TIMEOUT_MS } from "./sound-files";
import { createSound } from "./sound-output";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

const present = typeof document !== "undefined";

/** A desktop browser has navigator.vibrate and no motor; a touch screen is the sign of a phone. */
const hasMotor = () =>
  navigator.maxTouchPoints > 0 ||
  window.matchMedia?.("(pointer: coarse)").matches === true;

const reducedMotion = () =>
  window.matchMedia?.(REDUCED_MOTION).matches === true;

/** Before the learner has acted the browser ignores a vibration, so none is tried. */
function activation(): () => boolean {
  if (!present) return () => false;
  if (navigator.userActivation)
    return () => navigator.userActivation.hasBeenActive;
  let touched = false;
  const touch = () => {
    touched = true;
    for (const gesture of GESTURES)
      document.removeEventListener(gesture, touch, true);
  };
  for (const gesture of GESTURES) {
    document.addEventListener(gesture, touch, { capture: true, passive: true });
  }
  return () => touched;
}

const sound = createSound({
  makeContext:
    present && typeof AudioContext === "function"
      ? () => new AudioContext({ latencyHint: "interactive" })
      : undefined,
  fetchBytes: (url) => fetchBytes(url, FETCH_TIMEOUT_MS),
  now: () => performance.now(),
});

/**
 * Feel and recorded sound for answers, finished lessons and chosen items:
 * `haptics.trigger("correct")`. Vibration is silent where the device cannot,
 * under reduced motion and when the learner has turned it off. Sound is silent
 * while the teacher speaks or the microphone is open, and when the learner has
 * turned it off (reduced motion is about movement, not sound). Neither runs in
 * a hidden page or before the learner has touched it.
 */
export const haptics = createHaptics({
  outputs: present
    ? [
        vibrationOutput(navigator, hasMotor),
        gamepadOutput(navigator),
        sound.output,
      ].filter((output) => output !== null)
    : [],
  allows: (channel) =>
    channel === "touch"
      ? getSettings().vibration && !reducedMotion()
      : getSettings().sound && !isQuiet(),
  hidden: () => !present || document.visibilityState === "hidden",
  activated: activation(),
  now: () => performance.now(),
  wake: sound.unlock,
});

if (present) {
  // A cue already sounding or buzzing must not reach a recording or the teacher's voice.
  onHold(() => haptics.stop());
  // The recordings are fetched once the page is idle, so the first tap finds them; they are
  // decoded by the first gesture, which is also what creates the audio context.
  void whenIdle().then(() => {
    if (getSettings().sound) sound.prefetch();
  });
  window.addEventListener("online", sound.retry);
  // A context the system put to sleep wakes when the page comes back to the front. A tap inside a
  // lesson's frame never reaches these listeners, so this is the only wake it gets besides `wake`.
  for (const event of ["focus", "pageshow"]) {
    window.addEventListener(event, sound.resume);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sound.resume();
  });
  for (const gesture of GESTURES) {
    document.addEventListener(gesture, sound.unlock, {
      capture: true,
      passive: true,
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") haptics.stop();
  });
}
