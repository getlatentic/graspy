import { firstUsable, boxOf, measureTabbable } from "./focusable";
import {
  inReadingOrder,
  intersects,
  rank,
  type Box,
  type Candidate,
  type Direction,
} from "./geometry";
import { scopeOf } from "./scope";

/** Where the key was pressed from: the focused element's box, or null when nothing meaningful has focus. */
function originOf(active: Element | null, root: ParentNode): Box | null {
  if (!(active instanceof HTMLElement)) return null;
  if (active === active.ownerDocument.body) return null;
  if (root instanceof Element && !root.contains(active)) return null;
  return boxOf(active);
}

/** With nothing focused, the first control a person can see in reading order; none off screen, so the page may scroll instead. */
function firstInView(
  all: readonly Candidate<HTMLElement>[],
  win: Window,
  rtl: boolean,
): HTMLElement | null {
  const view = {
    left: 0,
    top: 0,
    right: win.innerWidth,
    bottom: win.innerHeight,
  };
  return firstUsable(
    inReadingOrder(
      all.filter((c) => intersects(c.box, view)),
      rtl,
    ),
  );
}

/**
 * The control that arrow `direction` moves focus to from `active`, or null.
 * Candidates are measured once, from the dialog or list the focus is in (else
 * the page); the focus's own `data-nav-group` is tried before the rest.
 */
export function findTarget(
  active: Element | null,
  direction: Direction,
  doc: Document,
): HTMLElement | null {
  const scope = scopeOf(active, doc);
  const all = measureTabbable(scope.root);
  const win = doc.defaultView ?? window;
  const rtl = getComputedStyle(doc.documentElement).direction === "rtl";
  const from = originOf(active, scope.root);
  if (!from) return firstInView(all, win, rtl);

  const others = all.filter((c) => c.item !== active);
  const group = scope.group;
  if (group) {
    const inGroup = others.filter((c) => group.contains(c.item));
    const hit = firstUsable(rank(from, inGroup, direction));
    if (hit) return hit;
  }
  return firstUsable(rank(from, others, direction));
}
