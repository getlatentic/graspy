/** The learn shell's side panes: how wide the lesson's conversation is, and which panes are open. */

export interface PaneLayout {
  menuOpen: boolean;
  chatOpen: boolean;
  /** In px. */
  chatWidth: number;
}

export const CHAT_WIDTH = { min: 288, max: 640, initial: 360 } as const;
export const KEY_STEP = 32;
const STORAGE_KEY = "graspy.panes";

export const DEFAULT_LAYOUT: PaneLayout = {
  menuOpen: true,
  chatOpen: true,
  chatWidth: CHAT_WIDTH.initial,
};

export const clampChatWidth = (width: number): number =>
  Math.min(CHAT_WIDTH.max, Math.max(CHAT_WIDTH.min, Math.round(width)));

/** The width after a key on the divider, or null for a key it ignores. The divider sits on the
 * conversation's inline-start edge, so the arrow that points away from the conversation widens it. */
export function widthAfterKey(
  key: string,
  width: number,
  rtl: boolean,
): number | null {
  const widening = rtl ? "ArrowRight" : "ArrowLeft";
  const narrowing = rtl ? "ArrowLeft" : "ArrowRight";
  if (key === widening) return clampChatWidth(width + KEY_STEP);
  if (key === narrowing) return clampChatWidth(width - KEY_STEP);
  if (key === "Home") return CHAT_WIDTH.min;
  if (key === "End") return CHAT_WIDTH.max;
  return null;
}

/** What was stored, or the default for anything that is not a layout. */
export function parseLayout(raw: string | null): PaneLayout {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null) return DEFAULT_LAYOUT;
    const { menuOpen, chatOpen, chatWidth } = stored as Record<string, unknown>;
    return {
      menuOpen:
        typeof menuOpen === "boolean" ? menuOpen : DEFAULT_LAYOUT.menuOpen,
      chatOpen:
        typeof chatOpen === "boolean" ? chatOpen : DEFAULT_LAYOUT.chatOpen,
      chatWidth:
        typeof chatWidth === "number" && Number.isFinite(chatWidth)
          ? clampChatWidth(chatWidth)
          : DEFAULT_LAYOUT.chatWidth,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function loadLayout(): PaneLayout {
  try {
    return parseLayout(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: PaneLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage can be blocked or full; the layout then lasts until the page is closed.
  }
}
