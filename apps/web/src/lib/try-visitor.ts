// The random id a visitor with no account holds in this browser, which the server binds their chats
// to. It names no device and no learner, and nothing else is kept under it.
const KEY = "graspy.try-visitor";

let held: string | null = null;

function keptIn(storage: () => Storage): string | null {
  try {
    const open = storage();
    const kept = open.getItem(KEY);
    if (kept) return kept;
    const made = crypto.randomUUID();
    open.setItem(KEY, made);
    return made;
  } catch {
    return null;
  }
}

// Where the id lives, in order: for good, for this tab (a reload keeps it), for this page. Each is
// tried only when the one before refuses, so a browser that blocks storage still has the same
// visitor from one load of the tab to the next, and the chats they began stay theirs.
export function tryVisitor(): string {
  held ??=
    keptIn(() => window.localStorage) ??
    keptIn(() => window.sessionStorage) ??
    crypto.randomUUID();
  return held;
}
