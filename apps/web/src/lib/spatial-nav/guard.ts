import { isEditable } from "../remote-keys";
import type { Direction } from "./geometry";
import { isTabbable } from "./focusable";
import { isScrollerFor } from "./scroll";
import type { FocusKind } from "./session";

export const DIRECTION_OF_KEY: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Widgets that use all the arrows themselves, whatever element inside them has focus. */
const WIDGETS =
  '[role="textbox"],[role="searchbox"],[role="slider"],[role="spinbutton"],[role="scrollbar"],[role="grid"],[role="treegrid"],[role="tree"]';
/** Controls whose arrows are seeking, volume or a value. */
const OWN_ARROWS =
  'input[type="range"], audio[controls], video[controls], [data-nav-skip]';

/** The element that has focus, inside shadow trees too. */
export function deepActive(doc: Document): Element | null {
  let active = doc.activeElement;
  while (active?.shadowRoot?.activeElement)
    active = active.shadowRoot.activeElement;
  return active;
}

/** The same element as seen from the page: a control in a shadow tree is its outermost host. */
export function hostInPage(el: Element | null): Element | null {
  let node = el;
  for (let root = node?.getRootNode(); root instanceof ShadowRoot;) {
    node = root.host;
    root = node.getRootNode();
  }
  return node;
}

/** A radio group wraps from its last button to its first; at either end the arrow that would wrap leaves instead. */
function radioLeaves(radio: HTMLInputElement, direction: Direction): boolean {
  const group = [
    ...radio.ownerDocument.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    ),
  ].filter(
    (r) => r.name === radio.name && r.form === radio.form && !r.disabled,
  );
  const forward = direction === "down" || direction === "right";
  return radio === (forward ? group.at(-1) : group[0]);
}

/** A native select changes value with Up and Down until it is at an end, and with Left and Right on some platforms; here Left and Right leave. */
function selectKeeps(select: HTMLSelectElement, direction: Direction): boolean {
  if (direction === "left" || direction === "right") return false;
  const last = select.options.length - 1;
  return direction === "down"
    ? select.selectedIndex < last
    : select.selectedIndex > 0;
}

/**
 * Whether the focused element keeps the arrow: editing, a widget with arrows of
 * its own, a native list of choices, an opted-out area, an open combobox or a
 * scroll area that can still scroll that way. A control that handled the key
 * is already skipped, since it called `preventDefault`.
 */
export function keepsArrows(
  active: Element | null,
  direction: Direction,
): boolean {
  if (
    !(active instanceof HTMLElement) ||
    active === active.ownerDocument.body
  ) {
    return false;
  }
  if (isEditable(active) || active instanceof HTMLIFrameElement) return true;
  if (active.matches(OWN_ARROWS) || active.closest(WIDGETS)) return true;
  if (active.closest("[data-nav-skip]")) return true;
  if (active instanceof HTMLSelectElement)
    return selectKeeps(active, direction);
  if (active instanceof HTMLInputElement && active.type === "radio") {
    return !radioLeaves(active, direction);
  }
  const open =
    active.getAttribute("role") === "combobox" &&
    active.getAttribute("aria-expanded") === "true";
  return open || isScrollerFor(active, direction);
}

function ringShown(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** What has focus: nothing, only a title or other thing that a program focused, or a control with or without its ring (a keyboard or pad put it there, or a click or a restore did). */
export function focusKind(active: Element | null): FocusKind {
  if (!(active instanceof HTMLElement)) return "none";
  if (active === active.ownerDocument.body) return "none";
  if (!isTabbable(active)) return "title";
  return ringShown(active) ? "visible-control" : "hidden-control";
}
