import { useSyncExternalStore } from "react";
import {
  getSettings,
  setSettings,
  subscribeSettings,
  type HapticSettings,
} from "../lib/haptic-settings";

/** The learner's vibration choice, shared by every screen that shows it. */
export function useHapticSettings() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  return {
    settings,
    change: (patch: Partial<HapticSettings>) =>
      setSettings({ ...settings, ...patch }),
  };
}
