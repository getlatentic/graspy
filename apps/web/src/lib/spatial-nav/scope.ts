/** Where arrow keys may move focus: inside an open dialog or list, otherwise anywhere on the page. */
const CONTAINING =
  '[role="dialog"],[role="alertdialog"],dialog[open],[role="listbox"],[role="menu"]';
const OPEN_MODAL = '[aria-modal="true"],dialog[open]';

export interface Scope {
  /** Candidates come from here. */
  root: ParentNode;
  /** Tried first: the `data-nav-group` the focus is in, so a row of chips is left only at its edge. */
  group: Element | null;
}

const isModal = (el: Element) => el.getAttribute("aria-modal") !== "false";

export function scopeOf(active: Element | null, doc: Document): Scope {
  const group = active?.closest("[data-nav-group]") ?? null;
  const inside = active?.closest(CONTAINING);
  if (inside && isModal(inside)) return { root: inside, group };
  const open = doc.querySelectorAll(OPEN_MODAL);
  const top = open.item(open.length - 1);
  return { root: top ?? doc, group };
}
