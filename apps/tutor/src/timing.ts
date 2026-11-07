import { AsyncLocalStorage } from "node:async_hooks";

interface Running {
  turn?: string;
  /** Keeps the host from ending the turn's request before work that outlives the reply is done (`waitUntil`). */
  anchor?: (work: Promise<unknown>) => void;
}

const turns = new AsyncLocalStorage<Running>();

/**
 * Runs a turn's work with the turn's id (the last six characters, as the API Worker logs it), so its parts can be read
 * beside the API's, and with the `anchor` that work started for after the reply is handed to.
 */
export function traced<T>(turn: string | undefined, work: () => Promise<T>, anchor?: Running["anchor"]): Promise<T> {
  return turn === undefined && anchor === undefined ? work() : turns.run({ turn: turn?.slice(-6), anchor }, work);
}

/** The turn the running work belongs to, by its last six characters, where it is in one. */
export const currentTurn = () => turns.getStore()?.turn;

/** Hands work that outlives the reply to the host to keep running; it is only awaited here by the host. */
export function anchored(work: Promise<unknown>): void {
  try {
    turns.getStore()?.anchor?.(work);
  } catch (error) {
    // The log is only a record: a host that refuses the anchor must not fail the child's turn.
    console.log(JSON.stringify({ part: "anchor-failed", error: String(error) }));
  }
}

/** How long a part of the turn took, so a child's wait can be read back from the logs, with the turn it was in. */
export async function timed<T>(part: string, work: Promise<T>): Promise<T> {
  const started = Date.now();
  const done = await work;
  const turn = currentTurn();
  console.log(JSON.stringify({ ...(turn === undefined ? {} : { turn }), part, ms: Date.now() - started }));
  return done;
}
