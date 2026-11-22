import { useSyncExternalStore } from "react";
import type { Channel } from "../lib/haptic-patterns";
import { haptics } from "../lib/haptics";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("gamepadconnected", onChange);
  window.addEventListener("gamepaddisconnected", onChange);
  return () => {
    window.removeEventListener("gamepadconnected", onChange);
    window.removeEventListener("gamepaddisconnected", onChange);
  };
}

/** Whether a channel could be felt or heard here; follows controllers coming and going. */
export function useHapticsSupported(channel: Channel): boolean {
  return useSyncExternalStore(
    subscribe,
    () => haptics.supported(channel),
    () => false,
  );
}
