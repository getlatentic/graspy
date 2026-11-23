import { boxOf, firstUsable, isTabbable } from "./focusable";
import { mayHop, type Origin } from "./fixed";
import {
  inReadingOrder,
  intersects,
  rank,
  type Box,
  type Candidate,
  type Direction,
} from "./geometry";
import { measureAll, measureNear, neighbourhood, withinReach } from "./measure";
import { scopeOf } from "./scope";

/** Whether the writing runs right to left where the key was pressed (the focused element's own `dir`, else the page's). */
function isRtl(from: Element | null, doc: Document): boolean {
  const dir = from?.closest("[dir]")?.getAttribute("dir");
  if (dir) return dir === "rtl";
  return getComputedStyle(doc.documentElement).direction === "rtl";
}

/**
 * Where the key was pressed from, or null when nothing meaningful has focus: a
 * title that has scrolled out of view is no origin. Nothing is scrolled here;
 * the target is revealed only once focus has really moved to it.
 */
function originOf(
  active: Element | null,
  root: ParentNode,
  view: Box,
): Origin | null {
  if (!(active instanceof HTMLElement)) return null;
  if (active === active.ownerDocument.body) return null;
  if (root instanceof Element && !root.contains(active)) return null;
  const box = boxOf(active);
  if (!box) return null;
  if (!isControl(active) && !intersects(box, view)) return null;
  return { el: active, box };
}

/**
 * The control that arrow `direction` moves focus to from `active`, or null.
 * Candidates are controls a person can use now (shown, not clipped away, not
 * covered, not a stuck header or bar far off), measured once from the open
 * modal dialog the focus is in (else the page), near the focus first: the ones
 * in view, then those within a viewport of it (scrolled to), then, if still
 * none, any on the page. The focus's own `data-nav-group` is tried first. With
 * nothing focused, the first control in view.
 */
export function findTarget(
  active: Element | null,
  direction: Direction,
  doc: Document,
  viewOnly = false,
): HTMLElement | null {
  const win = doc.defaultView ?? window;
  const view = {
    left: 0,
    top: 0,
    right: win.innerWidth,
    bottom: win.innerHeight,
  };
  const scope = scopeOf(active, doc);
  const origin = originOf(active, scope.root, view);
  const near = measureNear(
    scope.root,
    origin ? active : null,
    neighbourhood(view),
  );
  const rtl = isRtl(active, doc);

  const start = (el: HTMLElement, box: Box) =>
    mayHop(el, box, null, direction, doc);
  if (!origin) {
    const order = (set: Candidate<HTMLElement>[]) => inReadingOrder(set, rtl);
    const seen = near.filter((c) => intersects(c.box, view));
    if (viewOnly) return firstUsable(order(seen), start);
    return (
      firstUsable(order(seen), start) ??
      firstUsable(order(near), start) ??
      firstUsable(
        order(
          measureAll(scope.root).filter((c) =>
            withinReach(c.box, view, "down"),
          ),
        ),
        start,
      )
    );
  }

  const accept = (el: HTMLElement, box: Box) =>
    mayHop(el, box, origin, direction, doc);
  const pick = (set: Candidate<HTMLElement>[]) => {
    const others = set.filter((c) => c.item !== active);
    const group = scope.group;
    if (group) {
      const hit = firstUsable(
        rank(
          origin.box,
          others.filter((c) => group.contains(c.item)),
          direction,
        ),
        accept,
      );
      if (hit) return hit;
    }
    return firstUsable(rank(origin.box, others, direction), accept);
  };
  const inView = near.filter((c) => intersects(c.box, view));
  const found = viewOnly
    ? pick(inView)
    : (pick(inView) ??
      pick(near) ??
      pick(
        measureAll(scope.root).filter((c) =>
          withinReach(c.box, view, direction),
        ),
      ));
  if (found || (isControl(active) && intersects(origin.box, view))) {
    return found;
  }
  return fromStart(inView, active, direction, rtl, start);
}

const isControl = (el: Element | null) =>
  el instanceof HTMLElement && el !== el.ownerDocument.body && isTabbable(el);

/**
 * From a title (a full-width heading is no useful origin: the controls under
 * it are neither right nor left of it) nothing lies "that way", so any arrow
 * goes to the first control in view in reading order, or for Left and Up the
 * last.
 */
function fromStart(
  inView: Candidate<HTMLElement>[],
  active: Element | null,
  direction: Direction,
  rtl: boolean,
  accept: (el: HTMLElement, box: Box) => boolean,
): HTMLElement | null {
  const ordered = inReadingOrder(
    inView.filter((c) => c.item !== active),
    rtl,
  );
  const forward = direction === "down" || direction === "right";
  return firstUsable(forward ? ordered : ordered.reverse(), accept);
}
