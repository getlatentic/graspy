type Session = typeof import("@/lib/api/session");

const listeners = new Set<() => void>();
let held = false;
let endsAt: number | null = null;

const inForce = () => held && (endsAt === null || Date.now() < endsAt);

/** A stand-in for the parent's session, for tests of what sits behind the parent gate: `grant`
 * is the parent typing the PIN, `end` is the server or the clock ending it. */
export const parentSession = {
  grant() {
    held = true;
    listeners.forEach((listener) => listener());
  },
  end() {
    held = false;
    listeners.forEach((listener) => listener());
  },
  /** When the session runs out, in milliseconds since the epoch; null for not in this test. */
  endsAt(at: number | null) {
    endsAt = at;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get held() {
    return inForce();
  },
  reset() {
    held = false;
    endsAt = null;
    listeners.clear();
  },
};

/** The session module with the parent's session replaced by `parentSession`:
 * `vi.mock("@/lib/api/session", async (original) => (await import("@/test/parent-session")).withParentSession(await original()))`. */
export function withParentSession(original: Session): Session {
  return {
    ...original,
    hasParentSession: inForce,
    parentSessionEnds: () =>
      inForce() ? (endsAt ?? Date.now() + 10 * 60 * 1000) : null,
    subscribeParentSession: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
