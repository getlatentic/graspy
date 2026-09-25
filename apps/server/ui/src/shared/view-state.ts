export function readViewState<T>(
  key: string,
  accept: (value: unknown) => value is T,
  fallback: T,
): T {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return accept(kept) ? kept : fallback;
  } catch {
    return fallback;
  }
}

export function writeViewState(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage refused: the state lasts this visit only.
  }
}
