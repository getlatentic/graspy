/** The last control that had focus on each screen, by its stable key, for the screens of this visit only. */
const MAX_ROUTES = 50;

const lastKey = new Map<string, string>();
let current = "";

/** The screen the app is showing; set by `RouteFocus` as the route changes. */
export function setCurrentRoute(route: string): void {
  current = route;
}

export function currentRoute(): string {
  return current;
}

export function remember(route: string, key: string): void {
  lastKey.delete(route);
  lastKey.set(route, key);
  if (lastKey.size > MAX_ROUTES) {
    const oldest = lastKey.keys().next().value;
    if (oldest !== undefined) lastKey.delete(oldest);
  }
}

export function recall(route: string): string | null {
  return lastKey.get(route) ?? null;
}

export function forgetAll(): void {
  lastKey.clear();
  current = "";
}
