import type { Output } from "./haptic-device";
import { RUMBLES } from "./haptic-patterns";

const rumbles = (pad: Gamepad | null): pad is Gamepad =>
  pad !== null &&
  pad.connected &&
  typeof pad.vibrationActuator?.playEffect === "function";

/**
 * The first connected controller that can rumble (desktop and TV runtimes).
 * A TV remote has no motor and shows up as nothing here.
 */
export function gamepadOutput(
  nav: Partial<Pick<Navigator, "getGamepads">> | undefined,
): Output | null {
  if (typeof nav?.getGamepads !== "function") return null;
  const getPads = nav.getGamepads.bind(nav);
  const actuator = () => {
    try {
      return Array.from(getPads()).find(rumbles)?.vibrationActuator ?? null;
    } catch {
      return null;
    }
  };
  return {
    available: () => actuator() !== null,
    play: (cue) => {
      const { duration, weak, strong } = RUMBLES[cue];
      void actuator()
        ?.playEffect("dual-rumble", {
          startDelay: 0,
          duration,
          weakMagnitude: weak,
          strongMagnitude: strong,
        })
        .catch(() => undefined);
    },
    stop: () => {
      void actuator()
        ?.reset?.()
        ?.catch(() => undefined);
    },
  };
}
