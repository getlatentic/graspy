import { focusAndReveal } from "../focus-reveal";
import { findByFocusKey, focusKeyOf } from "./keys";
import { currentRoute, remember } from "./memory";
import { nearestSurvivor } from "./survivor";

interface Held {
  el: HTMLElement;
  key: string | null;
  route: string;
}

const lostFocus = (doc: Document) =>
  !doc.activeElement || doc.activeElement === doc.body;

/** The record that took `el` out of the page: where it was, from its neighbours at that moment. */
function removalOf(records: MutationRecord[], el: Element) {
  return records.find((r) =>
    [...r.removedNodes].some((n) => n === el || n.contains(el)),
  );
}

/**
 * Remembers which control had focus on each screen (see `focusKeyOf`), and when
 * the focused control leaves the page without focus going anywhere (a list
 * redrawn, an item removed), puts focus on the control that took its place, or
 * its nearest neighbour, instead of letting it fall to the page. A screen
 * change is left to `RouteFocus`. Returns what removes the listeners.
 */
export function installFocusMemory(doc: Document = document): () => void {
  let held: Held | null = null;

  const onFocusIn = (event: FocusEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    const key = focusKeyOf(event.target);
    held = { el: event.target, key, route: currentRoute() };
    if (key) remember(held.route, key);
  };

  const observer = new MutationObserver((records) => {
    if (!held || held.el.isConnected) return;
    const gone = held;
    held = null;
    if (gone.route !== currentRoute() || !lostFocus(doc)) return;
    const removal = removalOf(records, gone.el);
    const back = gone.key ? findByFocusKey(doc, gone.key) : null;
    const next =
      back ?? (removal && nearestSurvivor(removal.target, removal.nextSibling));
    if (next) focusAndReveal(next);
  });

  doc.addEventListener("focusin", onFocusIn);
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => {
    doc.removeEventListener("focusin", onFocusIn);
    observer.disconnect();
  };
}
