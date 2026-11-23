import {
  isTabbable,
  isOut,
  isShown,
  FOCUSABLE,
} from "../spatial-nav/focusable";

/** The control to take or hold focus within `node`: the node itself or the first control inside it that a person can use. */
function usableIn(node: Element): HTMLElement | null {
  const options = [node, ...node.querySelectorAll(FOCUSABLE)];
  for (const el of options) {
    if (
      el instanceof HTMLElement &&
      el.matches(FOCUSABLE) &&
      isTabbable(el) &&
      !isOut(el) &&
      isShown(el)
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Where focus goes when its control was removed from `parent`, which now holds
 * `next` where it was: the control that took its place, then the one before,
 * then those further out on either side, so a person stays at the same spot in
 * the list.
 */
export function nearestSurvivor(
  parent: Node,
  next: Node | null,
): HTMLElement | null {
  if (!(parent instanceof Element) || !parent.isConnected) return null;
  // Under the body sit the app's root and portals (a closed dialog); a neighbour there is not an item's.
  if (parent === parent.ownerDocument.body) return null;
  const kids = [...parent.children];
  const at = next instanceof Element ? kids.indexOf(next) : kids.length;
  if (at < 0) return null;
  for (let reach = 0; reach < kids.length; reach += 1) {
    for (const index of [at + reach, at - reach - 1]) {
      const kid = kids[index];
      const found = kid ? usableIn(kid) : null;
      if (found) return found;
    }
  }
  return null;
}
