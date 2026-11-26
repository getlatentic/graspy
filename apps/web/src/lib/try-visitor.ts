// The random id a visitor with no account holds in this browser, which the server binds their chats
// to. It names no device and no learner, and nothing else is kept under it.
const KEY = "graspy.try-visitor";

let inMemory: string | null = null;

export function tryVisitor(): string {
  try {
    const kept = window.localStorage.getItem(KEY);
    if (kept) return kept;
    const made = crypto.randomUUID();
    window.localStorage.setItem(KEY, made);
    return made;
  } catch {
    // Storage refused: the visitor is the same until the tab closes.
    inMemory ??= crypto.randomUUID();
    return inMemory;
  }
}
