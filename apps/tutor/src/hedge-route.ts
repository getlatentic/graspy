/**
 * The router with the observer as its second opinion on a slow turn. The router is asked first; when it has not answered
 * by the time its request is sent again (`HEDGE_AFTER_MS`), the observer starts beside that second request and the first
 * action either settles is taken. The observer's action is the policy's (see policy.ts), so what it reads as a need or a
 * safety matter is answered as one; where the policy settles nothing, only the router can answer. The observer also starts
 * where the router answers with nothing usable. A turn the router answers in time never calls it.
 */

import { MODEL_TIMEOUT_MS, routeUtterance, type Route } from "./router";
import { currentTurn } from "./timing";
import type { Ask } from "./turn";

/** Who chose the action a turn took: the safety rule answers a need before any model is asked. */
export type Decider = "router" | "observer" | "rule";

export interface Routed {
  route: Route;
  by: Decider;
}

/** What the observer's reading decides, or null where it could not read or the policy settles nothing. */
export type Observed = () => Promise<{ route: Route | null } | null>;

/**
 * The first action from the router, or from the observer once the router's second request is sent; null where
 * neither has one. Nothing but timings and who decided is logged: never the child's words.
 */
export async function routeWithObserver(env: Env, ask: Ask, observed: Observed): Promise<Routed | null> {
  const started = Date.now();
  let hedged = false;
  let cap: ReturnType<typeof setTimeout> | undefined;
  const decided = await new Promise<Routed | null>((resolve) => {
    let pending = 1;
    // The observer is started late, so it is not waited for past the time the router itself is given.
    cap = setTimeout(() => resolve(null), MODEL_TIMEOUT_MS);
    const settle = (routed: Routed | null) => {
      if (routed !== null) resolve(routed);
      else if (--pending === 0) resolve(null);
    };
    const beside = () => {
      if (hedged) return;
      hedged = true;
      pending += 1;
      void Promise.resolve().then(observed).then((seen) => settle(seen?.route ? { route: seen.route, by: "observer" } : null), () => settle(null));
    };
    // A router that answered with nothing usable is no reason to wait: the observer is the second opinion then too.
    const answered = (route: Route | null) => {
      if (route === null) beside();
      settle(route === null ? null : { route, by: "router" });
    };
    void routeUtterance(env, ask, beside).then(answered, () => answered(null));
  }).finally(() => clearTimeout(cap ?? null));
  if (hedged) {
    const turn = currentTurn();
    console.log(JSON.stringify({ ...(turn === undefined ? {} : { turn }), part: "route-hedge", by: decided?.by ?? "none", action: decided?.route.action ?? null, ms: Date.now() - started }));
  }
  return decided;
}
