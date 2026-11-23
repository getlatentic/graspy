import { isEditable } from "../remote-keys";
import type { Direction } from "./geometry";

export const DIRECTION_OF_KEY: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Controls that use the arrows themselves: a slider, a native list of choices, a radio group. */
const OWN_ARROWS =
  'select, input[type="range"], input[type="radio"], [role="slider"], [role="spinbutton"], [role="scrollbar"]';

/** A focused scroll area that can still scroll that way keeps the arrow, so a long text can be read with it. */
function scrollsThatWay(el: HTMLElement, direction: Direction): boolean {
  const vertical = direction === "up" || direction === "down";
  const style = getComputedStyle(el);
  const overflow = vertical ? style.overflowY : style.overflowX;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  const [at, room] = vertical
    ? [el.scrollTop, el.scrollHeight - el.clientHeight]
    : [el.scrollLeft, el.scrollWidth - el.clientWidth];
  const towardsEnd = direction === "down" || direction === "right";
  return towardsEnd ? at < room - 1 : at > 0;
}

/** Whether the focused element is one the arrows must be left to: editing, its own arrows, an opted-out area or a scroll area. */
export function keepsArrows(
  active: Element | null,
  direction: Direction,
): boolean {
  if (!(active instanceof HTMLElement) || active === document.body)
    return false;
  if (isEditable(active) || active instanceof HTMLIFrameElement) return true;
  if (active.matches(OWN_ARROWS) || active.closest("[data-nav-skip]")) {
    return true;
  }
  const openList =
    active.getAttribute("role") === "combobox" &&
    active.getAttribute("aria-expanded") === "true";
  if (openList) return true;
  return scrollsThatWay(active, direction);
}
