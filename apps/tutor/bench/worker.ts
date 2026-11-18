import { HOMOPHONES, readWithClef, saidOnlyThatTheyDoNotKnow, type Reading } from "../src/interpret";
import { answerHeard } from "../src/read";
import { isOnlyTheAnswer, needFor } from "../src/safety";
import { ACTIONS, SETTING, mayBeAnAnswer, routeUtterance, type Action, type Route } from "../src/router";
import { soundsLike } from "../src/sounds-like";
import { routeWithObserver } from "../src/hedge-route";
import { bedrockPath } from "../src/speller-host";
import { observe, observeAndDecide } from "../src/observer";
import { decide, THRESHOLD } from "../src/policy";
import { observeWithClef } from "./clef-observer";

/**
 * What the tutor reads for a recognised answer, without the question, in the order turn.ts tries: a plain
 * "I don't know", the sound-alike table, then Clef (where it is on) and the small reader.
 */
async function reading(env: Env, heard: string, clef: boolean): Promise<Reading | null> {
  if (saidOnlyThatTheyDoNotKnow(heard)) return { kind: "dont_know" };
  const homophone = HOMOPHONES[heard.toLowerCase().replace(/[^a-z]/g, "")];
  if (homophone !== undefined) return { kind: "number", value: homophone };
  if (clef) {
    const read = await readWithClef(env, heard).catch(() => null);
    if (read !== null && read.kind !== "unclear") return read;
  }
  const number = await answerHeard(env, heard).catch(() => null);
  if (number !== null) return { kind: "number", value: number };
  return { kind: "unclear" };
}

/** Clef's choice among the actions, taken at the threshold, then the same safety rule as the model router. */
async function routeWithClef(env: Env, model: "clef" | "clef-flash", prompt: string, heard: string, threshold: number): Promise<Route | null> {
  const reply = (await env.AI.run(`@cf/cloudflare/${model}`, {
    model,
    state: `The question just asked: ${prompt}\nThe recogniser wrote what the child said: ${JSON.stringify(heard)}`,
    questions: { action: { type: "choice", instructions: `${SETTING}What should the teacher do with it?`, criteria: ACTIONS } },
  }).catch(() => null)) as { answers?: { action?: { probabilities?: Record<string, number> } } } | null;
  const entries = Object.entries(reply?.answers?.action?.probabilities ?? {});
  if (entries.length === 0) return null;
  const [action, p] = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return p >= threshold ? { action: action as Action } : null;
}

const GENERATOR_MODEL = "openai.gpt-oss-120b";

/**
 * Plain text from gpt-oss-120b on Bedrock, by the same host and key as src/bedrock-chat.ts. Its structured output on this wire is
 * unreliable (a stray character or a doubled brace before the JSON, in about one reply in two), so the scripts ask for one item
 * to a line and read the lines.
 */
async function generate(env: Env, system: string, user: string): Promise<string | null> {
  const response = await fetch(`https://bedrock-mantle.${env.AWS_REGION || "us-east-1"}.api.aws${bedrockPath(GENERATOR_MODEL)}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.AWS_BEARER_TOKEN_BEDROCK}`, "content-type": "application/json" },
    body: JSON.stringify({ model: GENERATOR_MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.8, max_completion_tokens: 8000, reasoning_effort: "low" }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) return null;
  return ((await response.json()) as { choices?: { message?: { content?: string | null } }[] }).choices?.[0]?.message?.content ?? null;
}

async function timed<T>(work: Promise<T>): Promise<[T, number]> {
  const started = Date.now();
  return [await work, Date.now() - started];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 500 });
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  {
    if (new URL(request.url).pathname === "/route") {
      const { heard, prompt, model = "gemma", threshold = 0.7 } = (await request.json()) as { heard: string; prompt: string; model?: "gemma" | "clef" | "clef-flash"; threshold?: number };
      const [chosen, ms] = await timed(model === "gemma" ? routeUtterance(env, { prompt, heard, language: "en", expect: { kind: "fact", item: "10" } }).catch(() => null) : routeWithClef(env, model, prompt, heard, threshold));
      const need = needFor(heard, 10);
      const route = need === null ? chosen : { action: need };
      // Clef has no number to give and no reply to write; Gemma's answer is checked by sound.
      const accepted = model === "gemma" && route?.action === "mark_answer" && route.said !== undefined && soundsLike(heard, route.said);
      return Response.json({ route, ms, accepted, mayBeAnAnswer: mayBeAnAnswer(heard), soundsLikeTheAnswer: isOnlyTheAnswer(heard, 10), foundBySafetyRule: need !== null });
    }
    if (new URL(request.url).pathname === "/generate") {
      // One structured-output call to gpt-oss-120b on Bedrock, for the scripts that write and check cases (bench/add-model-cases.ts). Never a Claude model.
      const { system, user } = (await request.json()) as { system: string; user: string };
      return Response.json({ text: await generate(env, system, user) });
    }
    if (new URL(request.url).pathname === "/hedge") {
      // The router alone (with its own second request) against the router with the observer started beside that second request.
      const { heard, prompt, arm } = (await request.json()) as { heard: string; prompt: string; arm: "router" | "hedged" };
      const ask = { prompt, heard, language: "en" as const, expect: { kind: "fact" as const, item: "10" } };
      let observerAsked = false;
      const [decided, ms] = await timed(
        arm === "router"
          ? routeUtterance(env, ask).then((route) => (route === null ? null : { route, by: "router" }))
          : routeWithObserver(env, ask, () => { observerAsked = true; return observeAndDecide(env, ask); }),
      );
      return Response.json({ ms, observerAsked, by: decided?.by ?? "none", action: decided?.route.action ?? null });
    }
    if (new URL(request.url).pathname === "/observe") {
      const { heard, prompt, expected, model = "gemma", thresholds } = (await request.json()) as { heard: string; prompt: string; expected: number; model?: "gemma" | "clef" | "clef-flash"; thresholds?: Partial<typeof THRESHOLD> };
      const at = { ...THRESHOLD, ...thresholds };
      const [observation, ms] = await timed(model === "gemma" ? observe(env, { prompt, heard, language: "en", expect: { kind: "fact", item: String(expected) } }).catch(() => null) : observeWithClef(env, model, prompt, heard));
      const route = observation === null ? null : decide(observation, { words: heard, expected }, at);
      return Response.json({ observation, route, ms, thresholds: at });
    }
    const { heard } = (await request.json()) as { heard: string };
    const [legacy, legacyMs] = await timed(reading(env, heard, false));
    const [clef, clefMs] = await timed(reading(env, heard, true));
    return Response.json({ legacy, legacyMs, clef, clefMs });
  }
}
