/**
 * What Back closes. A popup, a dialog or an open list registers a way to close
 * itself while it is open; Back closes the topmost one first, and only when
 * nothing is open does it step back through the app's own history.
 */
type Closer = () => void;

const open: Closer[] = [];

/** Registers `close` as the topmost thing Back closes; returns what removes it. */
export function pushBack(close: Closer): () => void {
  open.push(close);
  return () => {
    const at = open.lastIndexOf(close);
    if (at >= 0) open.splice(at, 1);
  };
}

/** Closes the topmost open popup, if any; says whether it did. No navigation: Escape on a desktop does this. */
export function closeTopPopup(): boolean {
  const top = open[open.length - 1];
  if (!top) return false;
  top();
  return true;
}

export type BackResult = "closed" | "blurred" | "history" | "stayed";

type Past = Pick<History, "back"> & { state: unknown };

/**
 * Whether the app has a screen of its own to go back to. The router numbers its
 * history entries from 0 (`history.state.idx`), and a replace keeps the number,
 * so this is not fooled by the pages the browser holds from before the app, nor
 * by a redirect on the first screen.
 */
export function canStepBack(history: Pick<History, "state"> = window.history) {
  const idx = (history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}

/**
 * Handles one press of Back. The topmost open popup closes first. In a text
 * field, Back only leaves the field, which puts away an on-screen keyboard,
 * and does not change screen. Otherwise it steps back through the app's
 * history; on the first screen it stays, since leaving the app is the
 * platform's choice, not an accident of a key.
 */
export function goBack(
  history: Past = window.history,
  field: HTMLElement | null = null,
): BackResult {
  const top = open[open.length - 1];
  if (top) {
    top();
    return "closed";
  }
  if (field) {
    field.blur();
    return "blurred";
  }
  if (canStepBack(history)) {
    history.back();
    return "history";
  }
  return "stayed";
}
