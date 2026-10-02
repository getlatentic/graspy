import { callJson } from "./bedrock-chat";
import { heardForPrompt } from "./guard";
import { expectedAnswer, spokenNumber } from "./mark";
import { contextFor, OBSERVATION_SCHEMA, parseObservation, SYSTEM, type Observation } from "./observation";
import { decide } from "./policy";
import { ROUTER_MODEL, type Route } from "./router";
import type { Ask } from "./turn";

const MODEL_TIMEOUT_MS = 3000;

/** What the model says the child communicated, or null where it could not say. */
export async function observe(env: Env, ask: Ask): Promise<Observation | null> {
  const reported = await callJson(env, {
    model: env.OBSERVER_MODEL || env.ROUTER_MODEL || ROUTER_MODEL,
    system: SYSTEM,
    user: contextFor(ask, heardForPrompt(ask.heard)),
    schema: OBSERVATION_SCHEMA,
    name: "observation",
    timeoutMs: MODEL_TIMEOUT_MS,
    maxTokens: 300,
    part: "observe-model-failed",
  }).catch(() => null);
  return reported === null ? null : parseObservation(reported);
}

/** What the model observed and what the policy decides on it (null where that settles nothing); null where there was no observation. */
export async function observeAndDecide(env: Env, ask: Ask): Promise<{ observation: Observation; route: Route | null } | null> {
  const observation = await observe(env, ask);
  if (observation === null) return null;
  const expected = ask.expect.kind === "fact" ? spokenNumber(expectedAnswer(ask.expect.item)) : null;
  return { observation, route: decide(observation, { words: heardForPrompt(ask.heard), expected, question: ask.prompt }) };
}

/** The action for what the child said: the model's observation, decided by the policy; null where that settles nothing. */
export async function observedRoute(env: Env, ask: Ask): Promise<Route | null> {
  return (await observeAndDecide(env, ask))?.route ?? null;
}
