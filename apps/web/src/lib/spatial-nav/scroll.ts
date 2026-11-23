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

/** Whether an arrow in `direction` would scroll something on its own from `from`: its scroll areas, then the page. */
export function scrollsNatively(
  from: Element | null,
  direction: Direction,
  doc: Document,
): boolean {
  for (let el = from; el; el = el.parentElement) {
    if (scrolls(el, direction)) return true;
  }
  return pageScrolls(doc, direction);
}

/** The page can scroll that way: it has room, and neither the root nor the body is `overflow: hidden` (a dialog sets that on the body). */
function pageScrolls(doc: Document, direction: Direction): boolean {
  const vertical = direction === "up" || direction === "down";
  for (const el of [doc.documentElement, doc.body]) {
    const style = getComputedStyle(el);
    if ((vertical ? style.overflowY : style.overflowX) === "hidden")
      return false;
  }
  return hasRoom(doc.scrollingElement ?? doc.documentElement, direction);
}

/** A focused scroll area that can still scroll that way keeps the arrow, so a long text can be read with it. */
export function isScrollerFor(el: Element, direction: Direction): boolean {
  return scrolls(el, direction);
}
