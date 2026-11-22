/**
 * What Back closes. A popup, a dialog or an open list registers a way to close
 * itself while it is open; Back closes the topmost one first, and only when
 * nothing is open does it step back through the app's history.
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

export type BackResult = "closed" | "history" | "stayed";

/**
 * Handles one press of Back. On the first screen, where there is no history to
 * step back through, it stays: leaving the app is the platform's choice, not an
 * accident of a key.
 */
export function goBack(
  history: Pick<History, "back" | "length"> = window.history,
): BackResult {
  const top = open.at(-1);
  if (top) {
    top();
    return "closed";
  }
  if (history.length > 1) {
    history.back();
    return "history";
  }
  return "stayed";
}
