import type { Box, Candidate } from "./geometry";

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

/** A control a person can reach with Tab: enabled and not taken out of the tab order (a roving group's other members are). */
export function isTabbable(el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false;
  if ((el as HTMLButtonElement).disabled) return false;
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

/** The page position of a control, or null when it has no area a pointer could hit (a skip link kept off screen is 1px). */
export function boxOf(el: HTMLElement): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Every tabbable control under `root` that has an area, measured once; visibility is checked later, only on the few that win. */
export function measureTabbable(root: ParentNode): Candidate<HTMLElement>[] {
  const found: Candidate<HTMLElement>[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (!isTabbable(el)) continue;
    const box = boxOf(el);
    if (box) found.push({ item: el, box });
  }
  return found;
}

/** The first of `ordered` a person could use: shown, not hidden by an ancestor, not opted out. */
export function firstUsable(
  ordered: readonly Candidate<HTMLElement>[],
): HTMLElement | null {
  for (const { item } of ordered) {
    if (!isOut(item) && isShown(item)) return item;
  }
  return null;
}
