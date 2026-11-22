/** What the learner chose, kept on this device like the panes' layout. */
export interface HapticSettings {
  enabled: boolean;
}

const STORAGE_KEY = "graspy.haptics";

export const DEFAULT_SETTINGS: HapticSettings = { enabled: true };

export function parseSettings(raw: string | null): HapticSettings {
  try {
    const stored: unknown = JSON.parse(raw ?? "null");
    const enabled = (stored as { enabled?: unknown } | null)?.enabled;
    return typeof enabled === "boolean" ? { enabled } : DEFAULT_SETTINGS;
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
