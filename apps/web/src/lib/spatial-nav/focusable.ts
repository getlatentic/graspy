import { clip, intersects, type Box, type Candidate } from "./geometry";

/** What a person can put focus on with Tab. */
export const FOCUSABLE = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  "audio[controls]",
  "video[controls]",
].join(",");

/** A node with `tabindex` and no area is still tried up to this many times, so a page of hidden controls costs a bounded amount. */
const MAX_TRIES = 25;

function disabled(el: HTMLElement): boolean {
  try {
    return el.matches(":disabled");
  } catch {
    return (el as HTMLButtonElement).disabled === true;
  }
}

/** A control a person can reach with Tab: enabled (also inside a disabled fieldset) and not taken out of the tab order (a roving group's other members are). */
export function isTabbable(el: HTMLElement): boolean {
  if (el.tabIndex < 0 || disabled(el)) return false;
  return !(el instanceof HTMLInputElement && el.type === "hidden");
}

/** Hidden from people and from assistive technology, or opted out of arrow navigation. */
export function isOut(el: Element): boolean {
  return el.closest('[inert],[aria-hidden="true"],[data-nav-skip]') !== null;
}

/** Whether a person can see the control: not `visibility: hidden` or `display: none` on it or a parent. */
export function isShown(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true });
  }
  return getComputedStyle(el).visibility !== "hidden";
}

function boxOfRect(r: DOMRect): Box {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** The page position of a control, or null when it has no area a pointer could hit (a skip link kept off screen is 1px). */
export function boxOf(el: HTMLElement): Box | null {
  const r = el.getBoundingClientRect();
  return r.width < 2 || r.height < 2 ? null : boxOfRect(r);
}

/** Every tabbable control under `root` that is at least partly inside `view`, measured once; what costs more is checked later, on the few that win. */
export function measureTabbable(
  root: ParentNode,
  view: Box,
): Candidate<HTMLElement>[] {
  const found: Candidate<HTMLElement>[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (!isTabbable(el)) continue;
    const box = boxOf(el);
    if (box && intersects(box, view)) found.push({ item: el, box });
  }
  return found;
}

/** The part of `box` that no scrolling or clipping ancestor cuts off, or null when none is left. */
export function visibleBox(el: HTMLElement, box: Box): Box | null {
  let seen: Box | null = box;
  for (let a = el.parentElement; a && seen; a = a.parentElement) {
    const style = getComputedStyle(a);
    if (style.overflowX === "visible" && style.overflowY === "visible") {
      continue;
    }
    if (!style.overflowX && !style.overflowY) continue;
    seen = clip(seen, boxOfRect(a.getBoundingClientRect()));
  }
  return seen;
}

/** Whether another element sits over the middle of the visible part (a non-modal overlay, a sticky bar). */
function covered(el: HTMLElement, seen: Box): boolean {
  if (typeof document.elementFromPoint !== "function") return false;
  const hit = document.elementFromPoint(
    (seen.left + seen.right) / 2,
    (seen.top + seen.bottom) / 2,
  );
  return hit !== null && !el.contains(hit) && !hit.contains(el);
}

/** The first of `ordered` a person could use now: shown, not under `inert`, `aria-hidden` or `data-nav-skip`, not clipped away, not covered. */
export function firstUsable(
  ordered: readonly Candidate<HTMLElement>[],
): HTMLElement | null {
  for (const { item, box } of ordered.slice(0, MAX_TRIES)) {
    if (isOut(item) || !isShown(item)) continue;
    const seen = visibleBox(item, box);
    if (seen && !covered(item, seen)) return item;
  }
  return null;
}
