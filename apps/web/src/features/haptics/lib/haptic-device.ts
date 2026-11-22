import { PATTERNS, type Cue } from "./haptic-patterns";

/** Something that can make a cue felt: a phone's motor or a controller's rumble. */
export interface Output {
  /** Whether a cue would be felt right now. */
  available(): boolean;
  play(cue: Cue): void;
  stop(): void;
}

/**
 * The phone's vibration motor (Chromium on Android). Where there is no
 * navigator.vibrate (iOS, Firefox, desktops) there is no output at all.
 */
export function vibrationOutput(
  nav: Partial<Pick<Navigator, "vibrate">> | undefined,
): Output | null {
  if (typeof nav?.vibrate !== "function") return null;
  const vibrate = (pattern: number | number[]) => {
    try {
      nav.vibrate?.(pattern);
    } catch {
      // A refused vibration is the same as none.
    }
  };
  return {
    available: () => true,
    play: (cue) => vibrate([...PATTERNS[cue]]),
    stop: () => vibrate(0),
  };
}
