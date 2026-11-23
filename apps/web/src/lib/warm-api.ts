import { API_BASE_URL } from "@/lib/env";

/** The server starts a fresh instance after a quiet spell, and the first request pays for it.
 * Asking it something trivial while the app loads makes that wait overlap with sign-in.
 * index.html asks first, while the scripts download, and says so here. */
export function warmApi(): void {
  if ((globalThis as { __graspyWarmed?: boolean }).__graspyWarmed) return;
  fetch(`${API_BASE_URL}/health`, { cache: "no-store" }).catch(() => {
    // Nothing waits on this: the first real request asks again and shows any failure.
  });
}
