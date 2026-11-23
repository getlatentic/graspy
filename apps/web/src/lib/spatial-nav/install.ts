import { focusAndReveal } from "../focus-reveal";
import { isTabbable } from "./focusable";
import { lastPointed, pointerWasUsed, trackActivity } from "./activity";
import { whileArrowMoves } from "./arrival";
import { DIRECTION_OF_KEY, deepActive, hostInPage, keepsArrows } from "./guard";
import { scrollsNatively } from "./scroll";
import { findTarget } from "./target";

/** A held arrow repeats every 30 ms or so; one move per this long keeps the focus from racing past what the eye follows. */
const REPEAT_MS = 70;

/** A control has focus (a heading that only a program focused, or the page, is not one). */
const hasControlFocus = (active: Element | null) =>
  active instanceof HTMLElement &&
  active !== active.ownerDocument.body &&
  isTabbable(active);

/**
 * Arrow keys move focus to the nearest visible control in that direction, on a
 * TV remote's pad and on a keyboard alike, and otherwise do what the browser
 * does (scroll). It listens after the page's own handlers (bubbling, on the
 * document), so a control that uses an arrow calls `preventDefault` and is left
 * alone, as are text fields, sliders, native lists, anything in `data-nav-skip`
 * and a chord. With no control focused, a person who has used a pointer, wheel
 * or touch is reading: the arrows scroll while something can scroll that way. A
 * session of the pad alone starts from the first control. The key is taken only
 * when focus really moved. Held keys repeat the move, throttled.
 */
export function installSpatialNav(doc: Document = document): () => void {
  let lastMove = -Infinity;
  const stopTracking = trackActivity(doc);

  const onKeyDown = (event: KeyboardEvent) => {
    const direction = DIRECTION_OF_KEY[event.key];
    if (!direction || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
      return;
    if (keepsArrows(deepActive(doc), direction)) return;
    const active = hostInPage(deepActive(doc));
    const now = performance.now();
    if (event.repeat && now - lastMove < REPEAT_MS) {
      event.preventDefault();
      return;
    }
    if (!hasControlFocus(active) && pointerWasUsed()) {
      const reading = lastPointed() ?? active;
      if (scrollsNatively(reading, direction, doc)) return;
    }
    const target = findTarget(active, direction, doc);
    if (!target || !whileArrowMoves(() => focusAndReveal(target))) return;
    event.preventDefault();
    lastMove = now;
  };

  doc.addEventListener("keydown", onKeyDown);
  return () => {
    doc.removeEventListener("keydown", onKeyDown);
    stopTracking();
  };
}
