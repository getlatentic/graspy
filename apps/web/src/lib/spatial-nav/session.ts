import type { Direction } from "./geometry";

/**
 * How the page is being driven: by a pointer or a reader (the arrows are the
 * browser's own: scrolling), or by a pad or keyboard navigating (they move
 * focus). A desktop visit starts as `pointer`, so a reader on the keyboard
 * scrolls with the arrows; a TV, or a screen with no hover or no pointer,
 * starts as `pad`, since a remote has no other way to begin. Pure; the DOM side
 * is `session-tracker.ts`.
 */
export type Mode = "pad" | "pointer";

/** `pointer`: a real pointer event. `moved`: an arrow, or a TV remote's key, took focus somewhere. */
export type SessionEvent = "pointer" | "moved";

/** What has focus when an arrow is pressed. */
export type FocusKind =
  "none" | "title" | "visible-control" | "hidden-control" | "offscreen-control";

export interface Plan {
  action: "native" | "navigate";
  mode: Mode;
}

export function reduce(_mode: Mode, event: SessionEvent): Mode {
  return event === "pointer" ? "pointer" : "pad";
}

/** Where a visit starts: the pad on a TV, or where there is no hover or no pointer (a hint for the start only, not a layout rule). */
export function initialMode(hints: {
  tv: boolean;
  noHover: boolean;
  noPointer: boolean;
}): Mode {
  return hints.tv || hints.noHover || hints.noPointer ? "pad" : "pointer";
}

/**
 * What an arrow does.
 * - pad: navigate.
 * - pointer, a control focused but off screen: native (the person scrolled away
 *   and is reading; focus is not pulled back).
 * - pointer, a control focused with its ring shown (Tab, the keyboard, the
 *   pad): navigate, and the session is pad. Tab alone changes nothing.
 * - pointer, nothing, only a title, or a control without its ring (a click,
 *   `autoFocus`, a restore on going back) focused: native only when something
 *   can actually scroll that way (`canScroll`: the page, or the scroll area
 *   under the pointer or the focus), since then the arrow is reading; when
 *   nothing can (a short page, onboarding, a dialog, the foot of a long page,
 *   Left and Right on a normal page) it navigates.
 */
export function planArrow(
  mode: Mode,
  focus: FocusKind,
  _direction: Direction,
  canScroll: boolean,
): Plan {
  const navigate: Plan = { action: "navigate", mode: "pad" };
  const native: Plan = { action: "native", mode: "pointer" };
  if (mode === "pad") return navigate;
  if (focus === "offscreen-control") return native;
  if (focus === "visible-control") return navigate;
  return canScroll ? native : navigate;
}

export interface PointerSample {
  type: string;
  pointerType?: string;
  movementX?: number;
  movementY?: number;
  clientX?: number;
  clientY?: number;
  detail?: number;
}

/** Where the pointer was when last seen, to tell a move from the page moving under a still pointer. */
export interface Seen {
  x: number;
  y: number;
}

const POINTERS = new Set(["mouse", "pen", "touch"]);

/**
 * Whether an event shows a person using a pointer. A move counts only if the
 * pointer moved (by `movement`, else by position): a page scrolling or laying
 * out under a still pointer, and a remote's pointer parked, send moves that
 * did not. A click from the keyboard (`detail` 0) does not count.
 */
export function isRealPointer(
  sample: PointerSample,
  last: Seen | null,
): boolean {
  switch (sample.type) {
    case "wheel":
    case "touchstart":
      return true;
    case "pointerdown":
      return POINTERS.has(sample.pointerType ?? "mouse");
    case "mousedown":
      return true;
    case "click":
      return (sample.detail ?? 0) > 0;
    case "pointermove":
    case "mousemove": {
      if (sample.pointerType && !POINTERS.has(sample.pointerType)) return false;
      const { movementX: mx, movementY: my } = sample;
      if (mx !== undefined && my !== undefined) return mx !== 0 || my !== 0;
      return (
        last === null || sample.clientX !== last.x || sample.clientY !== last.y
      );
    }
    default:
      return false;
  }
}
