/**
 * The observer run beside the router, and only logged: `OBSERVER=shadow` leaves the router in charge of the turn and records what
 * the observation would have decided, so the two can be compared on real turns, with their latency, before one replaces the
 * other. The child's words are not logged unless `OBSERVER_LOG_TEXT` is on, which is for staging, where the children are simulated.
 */

import { heardForPrompt } from "./guard";
import type { Observation } from "./observation";
import { observeAndDecide } from "./observer";
import type { Route } from "./router";
import { currentTurn } from "./timing";
import type { Ask } from "./turn";

export interface Shadow {
  observation: Observation;
  route: Route | null;
  ms: number;
}

export const isShadowing = (env: Env) => env.OBSERVER === "shadow";

/** Starts the observer; null where it could not observe. */
export async function watch(env: Env, ask: Ask): Promise<Shadow | null> {
  const started = Date.now();
  const seen = await observeAndDecide(env, ask).catch(() => null);
  return seen === null ? null : { ...seen, ms: Date.now() - started };
}

const rounded = (scores: Record<string, number>) => Object.fromEntries(Object.entries(scores).filter(([, score]) => score >= 0.2).map(([name, score]) => [name, Math.round(score * 100) / 100]));

/**
 * Logs the router's action and the observer's beside each other when the observer has answered. The turn does not wait for it: it
 * is logged when it is there, with the turn's id. The child's words, and the number read from them, only where asked for.
 */
export function report(env: Env, ask: Ask, controlling: Route | null, shadow: Promise<Shadow | null>): void {
  const turn = currentTurn();
  void shadow.then((seen) => {
    const said = seen?.route ?? null;
    const words = env.OBSERVER_LOG_TEXT === "on";
    console.log(
      JSON.stringify({
        ...(turn === undefined ? {} : { turn }),
        part: "observer-shadow",
        router: controlling?.action ?? null,
        observer: seen === null ? "none" : (said?.action ?? null),
        agree: seen !== null && controlling?.action === said?.action && controlling?.said === said?.said,
        ms: seen?.ms ?? null,
        ...(seen === null ? {} : { communication: rounded(seen.observation.communication), need: rounded(seen.observation.physicalNeed), safety: rounded(seen.observation.safety) }),
        ...(seen !== null && words ? { answer: seen.observation.answer } : {}),
        ...(words ? { heard: heardForPrompt(ask.heard) } : {}),
      }),
    );
  });
}
