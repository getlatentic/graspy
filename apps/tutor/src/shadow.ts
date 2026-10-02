/**
 * The observer run beside the router, and only logged: `OBSERVER=shadow` leaves the router in charge of the turn and records what
 * the observation would have decided, so the two can be compared on real turns, with their latency, before one replaces the
 * other. The child's words are not logged unless `OBSERVER_LOG_TEXT` is on, which is for staging, where the children are simulated.
 */

import { heardForPrompt } from "./guard";
import type { Observation } from "./observation";
import { observeAndDecide } from "./observer";
import type { Route } from "./router";
import type { Ask } from "./turn";

/** How long after the router the observer is waited for: it is logged if it is there and given up on if it is not. */
const GRACE_MS = 1500;

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

/** Logs the router's action and the observer's beside each other, once the observer has answered or the grace has run out. */
export async function report(env: Env, ask: Ask, controlling: Route | null, shadow: Promise<Shadow | null>): Promise<void> {
  const seen = await Promise.race([shadow, new Promise<null>((resolve) => setTimeout(() => resolve(null), GRACE_MS))]);
  const said = seen?.route ?? null;
  console.log(
    JSON.stringify({
      part: "observer-shadow",
      router: controlling?.action ?? null,
      observer: seen === null ? "none" : (said?.action ?? null),
      agree: seen !== null && controlling?.action === said?.action && controlling?.said === said?.said,
      ms: seen?.ms ?? null,
      ...(seen === null ? {} : { answer: seen.observation.answer, communication: rounded(seen.observation.communication), need: rounded(seen.observation.physicalNeed), safety: rounded(seen.observation.safety) }),
      ...(env.OBSERVER_LOG_TEXT === "on" ? { heard: heardForPrompt(ask.heard) } : {}),
    }),
  );
}
