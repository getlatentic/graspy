import { AsyncLocalStorage } from "node:async_hooks";

const turns = new AsyncLocalStorage<string>();

/** Runs a turn's work with the turn's id (the last six characters, as the API Worker logs it), so its parts can be read beside the API's. */
export function traced<T>(turn: string | undefined, work: () => Promise<T>): Promise<T> {
  return turn === undefined ? work() : turns.run(turn.slice(-6), work);
}

/** How long a part of the turn took, so a child's wait can be read back from the logs, with the turn it was in. */
export async function timed<T>(part: string, work: Promise<T>): Promise<T> {
  const started = Date.now();
  const done = await work;
  const turn = turns.getStore();
  console.log(JSON.stringify({ ...(turn === undefined ? {} : { turn }), part, ms: Date.now() - started }));
  return done;
}
