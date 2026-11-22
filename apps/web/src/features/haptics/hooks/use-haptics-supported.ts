import { useSyncExternalStore } from "react";
import { haptics } from "../lib/haptics";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("gamepadconnected", onChange);
  window.addEventListener("gamepaddisconnected", onChange);
  return () => {
    window.removeEventListener("gamepadconnected", onChange);
    window.removeEventListener("gamepaddisconnected", onChange);
  };
}

/** Whether a phone's motor or a controller could make a cue felt; follows controllers coming and going. */
export function useHapticsSupported(): boolean {
  return useSyncExternalStore(subscribe, haptics.supported, () => false);
}
