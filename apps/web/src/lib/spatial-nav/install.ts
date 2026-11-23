import { focusAndReveal } from "../focus-reveal";
import { whileArrowMoves } from "./arrival";
import {
  DIRECTION_OF_KEY,
  deepActive,
  focusKind,
  hostInPage,
  keepsArrows,
} from "./guard";
import { planArrow } from "./session";
import { trackSession } from "./session-tracker";
import { findTarget } from "./target";

/** A held arrow repeats every 30 ms or so, and a TV may not say it is a repeat; one move per this long in the same direction keeps focus from racing past what the eye follows. */
const REPEAT_MS = 70;

/**
 * Arrow keys move focus to the nearest control in that direction, on a TV
 * remote's pad and on a keyboard alike, when the page is driven by a pad or
 * keyboard (the session, see `session.ts`); when a pointer is being used they
 * are the browser's own, so reading and scrolling work, except that Left and
 * Right (which scroll nothing) take a clicked control back to the pad. It
 * listens after the page's own handlers (bubbling, on the document), so a
 * control that uses an arrow calls `preventDefault` and is left alone, as are
 * text fields, sliders, native lists, anything in `data-nav-skip` and a chord.
 * With no control in view that way it goes to the nearest one on the page. The
 * key is taken only when focus really moved; a move that is too soon after the
 * last is swallowed only when there is a control to move to.
 */
export function installSpatialNav(doc: Document = document): () => void {
  let lastMove = -Infinity;
  let lastDirection = "";
  const session = trackSession(doc);

  const onKeyDown = (event: KeyboardEvent) => {
    session.keyPressed();
    if (event.key === "Tab") return session.apply("tab");
    const direction = DIRECTION_OF_KEY[event.key];
    if (!direction || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
      return;
    if (keepsArrows(deepActive(doc), direction)) return;
    const active = hostInPage(deepActive(doc));
    const plan = planArrow(session.mode(), focusKind(active), direction);
    if (plan.action === "native") return;
    session.apply("moved");
    const target = findTarget(active, direction, doc);
    if (!target) return;
    const now = performance.now();
    if (direction === lastDirection && now - lastMove < REPEAT_MS) {
      event.preventDefault();
      return;
    }
    if (!whileArrowMoves(() => focusAndReveal(target))) return;
    event.preventDefault();
    lastMove = now;
    lastDirection = direction;
  };

  doc.addEventListener("keydown", onKeyDown);
  return () => {
    doc.removeEventListener("keydown", onKeyDown);
    session.stop();
  };
}
