import { boxOf, firstUsable, measureTabbable } from "./focusable";
import { inReadingOrder, rank, type Box, type Direction } from "./geometry";
import { scopeOf } from "./scope";

/** Whether the writing runs right to left where the key was pressed (the focused element's own `dir`, else the page's). */
function isRtl(from: Element | null, doc: Document): boolean {
  const dir = from?.closest("[dir]")?.getAttribute("dir");
  if (dir) return dir === "rtl";
  return getComputedStyle(doc.documentElement).direction === "rtl";
}

/** Where the key was pressed from: the focused element's box, or null when nothing meaningful has focus. */
function originOf(active: Element | null, root: ParentNode): Box | null {
  if (!(active instanceof HTMLElement)) return null;
  if (active === active.ownerDocument.body) return null;
  if (root instanceof Element && !root.contains(active)) return null;
  return boxOf(active);
}

/**
 * The control that arrow `direction` moves focus to from `active`, or null.
 * Candidates are the controls a person can see now (in the viewport, in the
 * visible part of their scroll area, not covered), measured once, from the open
 * modal dialog the focus is in (else the page); the focus's own `data-nav-group`
 * is tried before the rest. With nothing focused, the first control in view.
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
  const all = measureTabbable(scope.root, view);
  const from = originOf(active, scope.root);
  if (!from) return firstUsable(inReadingOrder(all, isRtl(active, doc)));

  const others = all.filter((c) => c.item !== active);
  const group = scope.group;
  if (group) {
    const inGroup = others.filter((c) => group.contains(c.item));
    const hit = firstUsable(rank(from, inGroup, direction));
    if (hit) return hit;
  }
  return firstUsable(rank(from, others, direction));
}
