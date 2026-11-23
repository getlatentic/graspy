import { focusAndReveal } from "../focus-reveal";
import { movesFocus } from "../remote-keys";
import { whileArrowMoves } from "./arrival";
import {
  DIRECTION_OF_KEY,
  deepActive,
  focusKind,
  hostInPage,
  keepsArrows,
} from "./guard";
import { scrollsNatively } from "./scroll";
import { planArrow } from "./session";
import { trackSession } from "./session-tracker";
import { findTarget } from "./target";

/** A held arrow repeats every 30 ms or so, and a TV may not say it is a repeat; one move per this long in the same direction keeps focus from racing past what the eye follows. */
const REPEAT_MS = 70;
/** A key that found nothing, found nothing again at the same place for this long. */
const NOTHING_MS = 200;

/**
 * Arrow keys move focus to the nearest control in that direction, on a TV
 * remote's pad and on a keyboard alike, when the page is driven by a pad (the
 * session, see `session.ts`); when a person is reading they are the browser's
 * own. A desktop visit starts as reading, a TV as the pad; Left and Right (which
 * scroll nothing), an arrow on a control that shows its ring and any key of a TV
 * remote switch to the pad, a pointer switches back. It listens after the
 * page's own handlers (bubbling, on the document), so a control that uses an
 * arrow calls `preventDefault` and is left alone, as are text fields, sliders,
 * native lists, anything in `data-nav-skip` and a chord. The key is taken only
 * when focus really moved, and the session changes only then; a move that is
 * too soon after the last is swallowed only when there is a control to move to.
 */
export function installSpatialNav(doc: Document = document): () => void {
  let lastMove = -Infinity;
  let lastDirection = "";
  let none = { key: "", at: -Infinity };
  const session = trackSession(doc);
  const onTelevision = () => doc.documentElement.dataset.device === "tv";

  const where = (active: Element | null, direction: string) => {
    const page = doc.scrollingElement ?? doc.documentElement;
    return `${direction}|${page.scrollTop}|${page.scrollLeft}|${active ? active.tagName + (active.textContent ?? "").slice(0, 20) : ""}`;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    session.keyPressed();
    if (onTelevision() && movesFocus(event)) session.apply("moved");
    const direction = DIRECTION_OF_KEY[event.key];
    if (!direction || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
      return;
    if (keepsArrows(deepActive(doc), direction)) return;
    const active = hostInPage(deepActive(doc));
    const sideways =
      (direction === "left" || direction === "right") &&
      scrollsNatively(active ?? doc.body, direction, doc);
    const plan = planArrow(
      session.mode(),
      focusKind(active),
      direction,
      sideways,
    );
    if (plan.action === "native") return;
    const now = performance.now();
    const place = where(active, direction);
    if (none.key === place && now - none.at < NOTHING_MS) return;
    const target = findTarget(active, direction, doc);
    if (!target) {
      none = { key: place, at: now };
      return;
    }
    if (direction === lastDirection && now - lastMove < REPEAT_MS) {
      event.preventDefault();
      return;
    }
    if (!whileArrowMoves(() => focusAndReveal(target))) return;
    session.apply("moved");
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
