import { reveal } from "../focus-reveal";
import { boxOf, firstUsable } from "./focusable";
import { mayHop, type Origin } from "./fixed";
import {
  inReadingOrder,
  intersects,
  rank,
  type Box,
  type Candidate,
  type Direction,
} from "./geometry";
import { measureAll, measureNear, neighbourhood } from "./measure";
import { scopeOf } from "./scope";

/** Whether the writing runs right to left where the key was pressed (the focused element's own `dir`, else the page's). */
function isRtl(from: Element | null, doc: Document): boolean {
  const dir = from?.closest("[dir]")?.getAttribute("dir");
  if (dir) return dir === "rtl";
  return getComputedStyle(doc.documentElement).direction === "rtl";
}

/**
 * Where the key was pressed from, or null when nothing meaningful has focus. A
 * focused control that has scrolled out of view is first scrolled into view, so
 * the keys have somewhere to start.
 */
function originOf(
  active: Element | null,
  root: ParentNode,
  view: Box,
): Origin | null {
  if (!(active instanceof HTMLElement)) return null;
  if (active === active.ownerDocument.body) return null;
  if (root instanceof Element && !root.contains(active)) return null;
  let box = boxOf(active);
  if (box && !intersects(box, view)) {
    reveal(active);
    box = boxOf(active);
  }
  return box ? { el: active, box } : null;
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

  if (!origin) {
    const order = (set: Candidate<HTMLElement>[]) => inReadingOrder(set, rtl);
    const seen = near.filter((c) => intersects(c.box, view));
    return (
      firstUsable(order(seen)) ??
      firstUsable(order(near)) ??
      firstUsable(order(measureAll(scope.root)))
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
  return (
    pick(near.filter((c) => intersects(c.box, view))) ??
    pick(near) ??
    pick(measureAll(scope.root))
  );
}
