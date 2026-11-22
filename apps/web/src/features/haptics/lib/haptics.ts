import { isQuiet } from "@/lib/voice/quiet";
import { createHaptics } from "./create-haptics";
import { vibrationOutput } from "./haptic-device";
import { gamepadOutput } from "./haptic-gamepad";
import { getSettings } from "./haptic-settings";
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

const sound = createSound(
  present && typeof AudioContext === "function"
    ? () => new AudioContext({ latencyHint: "interactive" })
    : undefined,
);

/**
 * Feel and sound for answers, finished lessons and chosen items:
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
});

if (present) {
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
