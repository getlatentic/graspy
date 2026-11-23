import { isOut, isShown } from "./focusable";

/** Where arrow keys may move focus: inside an open modal dialog, otherwise anywhere on the page. */
const MODAL = '[aria-modal="true"],dialog[open]';

export interface Scope {
  /** Candidates come from here. */
  root: ParentNode;
  /** Tried first: the `data-nav-group` the focus is in, so a row of chips is left only at its edge. */
  group: Element | null;
}

/** `aria-modal="true"`, or a `dialog` opened with `showModal()`; a `role="dialog"` that says otherwise, and `dialog.show()`, do not trap. */
function isModal(el: Element): boolean {
  if (el.getAttribute("aria-modal") === "true") return true;
  if (!(el instanceof HTMLDialogElement) || !el.open) return false;
  try {
    return el.matches(":modal");
  } catch {
    return false;
  }
}

function modalAround(active: Element): Element | null {
  let node = active.closest(MODAL);
  while (node && !isModal(node))
    node = node.parentElement?.closest(MODAL) ?? null;
  return node;
}

/** The newest open modal a person can see (one under `inert` or `aria-hidden`, or hidden, is not it). */
function topModal(doc: Document): Element | null {
  const open = [...doc.querySelectorAll(MODAL)].filter(
    (el) => isModal(el) && !isOut(el) && isShown(el as HTMLElement),
  );
  return open[open.length - 1] ?? null;
}

export function scopeOf(active: Element | null, doc: Document): Scope {
  const group = active?.closest("[data-nav-group]") ?? null;
  const inside = active ? modalAround(active) : null;
  return { root: inside ?? topModal(doc) ?? doc, group };
}
