let holds = 0;

/**
 * Asks the app's own sounds to keep quiet (the teacher's voice is playing, the
 * microphone is open) until the returned function is called. Holds add up.
 */
export function holdQuiet(): () => void {
  holds += 1;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds -= 1;
  };
}

export const isQuiet = () => holds > 0;
