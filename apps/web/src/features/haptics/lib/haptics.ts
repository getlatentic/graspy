import { createHaptics } from "./create-haptics";
import { vibrationOutput } from "./haptic-device";
import { gamepadOutput } from "./haptic-gamepad";
import { getSettings } from "./haptic-settings";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

const present = typeof document !== "undefined";

/** A desktop browser has navigator.vibrate and no motor; a touch screen is the sign of a phone. */
const hasMotor = () =>
  navigator.maxTouchPoints > 0 ||
  window.matchMedia?.("(pointer: coarse)").matches === true;

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

/**
 * Feel for answers and finished lessons: `haptics.trigger("correct")`. Silent
 * where the device cannot, in a hidden page, under reduced motion, when the
 * learner has turned it off and before they have touched the page.
 */
export const haptics = createHaptics({
  outputs: present
    ? [vibrationOutput(navigator, hasMotor), gamepadOutput(navigator)].filter(
        (output) => output !== null,
      )
    : [],
  enabled: () => getSettings().enabled,
  hidden: () => !present || document.visibilityState === "hidden",
  reducedMotion: () =>
    typeof window !== "undefined" &&
    window.matchMedia?.(REDUCED_MOTION).matches === true,
  activated: activation(),
  now: () => performance.now(),
});

if (present) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") haptics.stop();
  });
}
