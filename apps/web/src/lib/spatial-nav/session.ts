import type { Direction } from "./geometry";

/**
 * How the page is being driven: by a pointer (mouse, pen, touch, wheel), where
 * the arrows are the browser's own (reading, scrolling), or by a pad or
 * keyboard, where they move focus. A visit starts as `pad`: a TV remote has no
 * other way to begin. Pure; the DOM side is `session-tracker.ts`.
 */
export type Mode = "pad" | "pointer";

export type SessionEvent = "pointer" | "tab" | "moved";

/** What has focus when an arrow is pressed. */
export type FocusKind = "none" | "title" | "visible-control" | "hidden-control";

export interface Plan {
  action: "native" | "navigate";
  mode: Mode;
}

/** A pointer puts the session in pointer mode; Tab, and a move of focus by an arrow, put it in pad mode. */
export function reduce(_mode: Mode, event: SessionEvent): Mode {
  return event === "pointer" ? "pointer" : "pad";
}

/**
 * What an arrow does.
 * - pad: navigate.
 * - pointer, nothing or only a title focused: native, all four arrows.
 * - pointer, a control focused with its ring shown (it came by keyboard or
 *   pad): navigate, and the session is pad.
 * - pointer, a control focused without a ring (a click, `autoFocus`, a restore
 *   on going back): Up and Down are native (reading, even when that control
 *   has scrolled out of view); Left and Right have nothing to scroll, so they
 *   navigate and the session is pad.
 */
export function planArrow(
  mode: Mode,
  focus: FocusKind,
  direction: Direction,
): Plan {
  const navigate: Plan = { action: "navigate", mode: "pad" };
  if (mode === "pad") return navigate;
  const native: Plan = { action: "native", mode: "pointer" };
  if (focus === "none" || focus === "title") return native;
  if (focus === "visible-control") return navigate;
  return direction === "left" || direction === "right" ? navigate : native;
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
