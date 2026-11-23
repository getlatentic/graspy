import type { Direction } from "./geometry";

const SCROLLS = new Set(["auto", "scroll", "overlay"]);

function hasRoom(el: Element, direction: Direction): boolean {
  const vertical = direction === "up" || direction === "down";
  const [at, room] = vertical
    ? [el.scrollTop, el.scrollHeight - el.clientHeight]
    : [el.scrollLeft, el.scrollWidth - el.clientWidth];
  return direction === "down" || direction === "right" ? at < room - 1 : at > 0;
}

function scrolls(el: Element, direction: Direction): boolean {
  const style = getComputedStyle(el);
  const vertical = direction === "up" || direction === "down";
  const overflow = vertical ? style.overflowY : style.overflowX;
  return SCROLLS.has(overflow) && hasRoom(el, direction);
}

export type Axis = "vertical" | "horizontal";

function roomAtAll(el: Element, axis: Axis): boolean {
  return axis === "vertical"
    ? el.scrollHeight - el.clientHeight > 1
    : el.scrollWidth - el.clientWidth > 1;
}

function scrollerOfAxis(el: Element, axis: Axis): boolean {
  const style = getComputedStyle(el);
  const overflow = axis === "vertical" ? style.overflowY : style.overflowX;
  return SCROLLS.has(overflow) && roomAtAll(el, axis);
}

/** The page scrolls on this axis at all: it has room, and neither the root nor the body is `overflow: hidden` (a dialog sets that on the body). */
function pageScrollsAtAll(doc: Document, axis: Axis): boolean {
  for (const el of [doc.documentElement, doc.body]) {
    const style = getComputedStyle(el);
    if (
      (axis === "vertical" ? style.overflowY : style.overflowX) === "hidden"
    ) {
      return false;
    }
  }
  return roomAtAll(doc.scrollingElement ?? doc.documentElement, axis);
}

/**
 * Whether anything around `from` scrolls on `axis` at all, wherever it is
 * scrolled to now: a scroll area that holds `from`, or the page. The answer
 * does not depend on the position, so holding an arrow down to the end of a
 * page does not turn it into navigation.
 */
export function scrollableAtAll(
  from: Element | null,
  axis: Axis,
  doc: Document,
): boolean {
  for (let el = from; el; el = el.parentElement) {
    if (scrollerOfAxis(el, axis)) return true;
  }
  return pageScrollsAtAll(doc, axis);
}

/** A focused scroll area that can still scroll that way keeps the arrow, so a long text can be read with it. */
export function isScrollerFor(el: Element, direction: Direction): boolean {
  return scrolls(el, direction);
}
