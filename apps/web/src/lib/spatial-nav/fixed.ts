import { alongGap, type Box, type Direction } from "./geometry";

/** The nearest ancestor-or-self that is `position: fixed` or `sticky`. */
export function stuckContainer(el: Element): Element | null {
  for (let a: Element | null = el; a; a = a.parentElement) {
    const position = getComputedStyle(a).position;
    if (position === "fixed" || position === "sticky") return a;
  }
  return null;
}

export interface Origin {
  el: Element | null;
  box: Box;
}

/**
 * Whether a hop to `el` is allowed. A header, bar or button that stays on
 * screen as the page scrolls (fixed or sticky) is a target only when the focus
 * is already in it, when it is directly next to the focus (within a rem), or,
 * for a sticky one, when the page is not scrolled (it is where it belongs).
 * Otherwise Up would always end at the page's header and Down at a bar at its
 * foot, however far off, and the content between could not be reached.
 */
export function mayHop(
  el: HTMLElement,
  box: Box,
  from: Origin | null,
  direction: Direction,
  doc: Document,
): boolean {
  const holder = stuckContainer(el);
  if (!holder || !from) return true;
  if (from.el && stuckContainer(from.el) === holder) return true;
  const page = doc.scrollingElement ?? doc.documentElement;
  if (getComputedStyle(holder).position === "sticky" && page.scrollTop === 0) {
    return true;
  }
  const rem = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize);
  return alongGap(from.box, box, direction) <= (rem || 16);
}
