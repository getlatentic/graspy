import { HOMOPHONES, readWithClef, saidOnlyThatTheyDoNotKnow, type Reading } from "../src/interpret";
import { answerHeard } from "../src/read";
import { isOnlyTheAnswer, needFor } from "../src/safety";
import { ACTIONS, SETTING, mayBeAnAnswer, routeUtterance, type Action, type Route } from "../src/router";
import { soundsLike } from "../src/sounds-like";

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
    const { heard } = (await request.json()) as { heard: string };
    const [legacy, legacyMs] = await timed(reading(env, heard, false));
    const [clef, clefMs] = await timed(reading(env, heard, true));
    return Response.json({ legacy, legacyMs, clef, clefMs });
  }
}
