/** What the learner chose, kept on this device like the panes' layout. */
export interface HapticSettings {
  vibration: boolean;
  sound: boolean;
}

const STORAGE_KEY = "graspy.haptics";

export const DEFAULT_SETTINGS: HapticSettings = {
  vibration: true,
  sound: true,
};

export function parseSettings(raw: string | null): HapticSettings {
  try {
    const stored = JSON.parse(raw ?? "null") as Partial<
      Record<keyof HapticSettings, unknown>
    > | null;
    const choice = (value: unknown, fallback: boolean) =>
      typeof value === "boolean" ? value : fallback;
    if (typeof stored !== "object" || stored === null) return DEFAULT_SETTINGS;
    return {
      vibration: choice(stored.vibration, DEFAULT_SETTINGS.vibration),
      sound: choice(stored.sound, DEFAULT_SETTINGS.sound),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function load(): HapticSettings {
  try {
    return parseSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(settings: HapticSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be blocked or full; the choice then lasts until the page is closed.
  }
}

let current: HapticSettings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): HapticSettings {
  current ??= load();
  return current;
}

export function setSettings(next: HapticSettings): void {
  current = next;
  save(next);
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab's choice applies here too; a cleared storage (key null) reads as the default.
if (typeof window !== "undefined") {
  window.addEventListener("storage", ({ key }) => {
    if (key !== STORAGE_KEY && key !== null) return;
    current = load();
    for (const listener of listeners) listener();
  });
}
