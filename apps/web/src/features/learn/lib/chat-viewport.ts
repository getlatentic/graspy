import type { CSSProperties } from "react";

/** A chat fills the page minus a phone's on-screen keyboard, which iOS leaves inside dvh. */
export const CHAT_VIEWPORT_CLASS =
  "fixed inset-x-0 top-[var(--visible-top,0px)] h-[var(--visible-height,100dvh)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]";

export function chatViewportStyle(
  visible: { top: number; height: number } | null,
): CSSProperties | undefined {
  return visible
    ? ({
        "--visible-top": `${visible.top}px`,
        "--visible-height": `${visible.height}px`,
      } as CSSProperties)
    : undefined;
}
