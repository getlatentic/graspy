import { clip, type Box, type Candidate } from "./geometry";

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

const area = (r: DOMRect) => r.width >= 2 && r.height >= 2;

/**
 * The page position of a control a person can point at, or null. A control
 * that is visually hidden (a 1px `sr-only` radio) is stood for by what shows
 * it: its label, else a parent with an area, so it can be an origin and a
 * target like any other.
 */
export function boxOf(el: HTMLElement): Box | null {
  const own = el.getBoundingClientRect();
  if (area(own)) return boxOfRect(own);
  const label = (el as HTMLInputElement).labels?.[0] ?? el.closest("label");
  const stand = [label, el.parentElement, el.parentElement?.parentElement];
  for (const node of stand) {
    const r = node?.getBoundingClientRect();
    if (r && area(r)) return boxOfRect(r);
  }
  return null;
}

/** The measured candidate, or null when it is not tabbable or has no area. */
export function measureOne(el: HTMLElement): Candidate<HTMLElement> | null {
  if (!isTabbable(el)) return null;
  const box = boxOf(el);
  return box ? { item: el, box } : null;
}

/**
 * The part of `box` that no scrolling or clipping ancestor cuts off, or null
 * when none is left. A fixed control is clipped by none; an absolute one only
 * by its containing block and what is outside it.
 */
export function visibleBox(el: HTMLElement, box: Box): Box | null {
  let seen: Box | null = box;
  let childPosition = getComputedStyle(el).position;
  for (let a = el.parentElement; a && seen; a = a.parentElement) {
    if (childPosition === "fixed") break;
    const style = getComputedStyle(a);
    if (childPosition === "absolute" && style.position === "static") continue;
    childPosition = style.position;
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
  if (!hit || el.contains(hit) || hit.contains(el)) return false;
  const labels = [...((el as HTMLInputElement).labels ?? [])];
  return !labels.some((l) => l.contains(hit));
}

/**
 * The first of `ordered` a person could use now: shown, not under `inert`,
 * `aria-hidden` or `data-nav-skip`, not clipped away, not covered, and accepted
 * by `accept` (the sticky and fixed rule).
 */
export function firstUsable(
  ordered: readonly Candidate<HTMLElement>[],
  accept: (el: HTMLElement, box: Box) => boolean = () => true,
): HTMLElement | null {
  for (const { item, box } of ordered.slice(0, MAX_TRIES)) {
    if (isOut(item) || !isShown(item) || !accept(item, box)) continue;
    const seen = visibleBox(item, box);
    if (seen && !covered(item, seen)) return item;
  }
  return null;
}
