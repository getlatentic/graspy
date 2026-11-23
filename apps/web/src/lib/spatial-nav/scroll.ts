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

/** A focused scroll area that can still scroll that way keeps the arrow, so a long text can be read with it. */
export function isScrollerFor(el: Element, direction: Direction): boolean {
  return scrolls(el, direction);
}
