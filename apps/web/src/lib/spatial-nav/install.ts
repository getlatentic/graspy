import { focusAndReveal } from "../focus-reveal";
import { whileArrowMoves } from "./arrival";
import { DIRECTION_OF_KEY, keepsArrows } from "./guard";
import { findTarget } from "./target";

/** A held arrow repeats every 30 ms or so; one move per this long keeps the focus from racing past what the eye follows. */
const REPEAT_MS = 70;

/**
 * Arrow keys move focus to the nearest control in that direction, on a TV
 * remote's five-way pad and on a keyboard alike. It listens after the page's
 * own handlers (bubbling, on the document), so any control that uses an arrow
 * calls `preventDefault` and is left alone; a text field, a slider, a native
 * list and anything inside `data-nav-skip` keep their arrows. When nothing
 * lies that way the key is not touched, and the page scrolls as it would.
 * Held keys repeat the move, throttled; a chord (Ctrl, Alt, Meta, Shift) is a
 * browser's or a field's own.
 */
export function installSpatialNav(doc: Document = document): () => void {
  let lastMove = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    const direction = DIRECTION_OF_KEY[event.key];
    if (!direction || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
      return;
    const active = doc.activeElement;
    if (keepsArrows(active, direction)) return;
    const now = Date.now();
    if (event.repeat && now - lastMove < REPEAT_MS) {
      event.preventDefault();
      return;
    }
    const target = findTarget(active, direction, doc);
    if (!target) return;
    event.preventDefault();
    lastMove = now;
    whileArrowMoves(() => focusAndReveal(target));
  };

  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}
