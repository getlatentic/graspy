import { HOMOPHONES, readWithClef, saidOnlyThatTheyDoNotKnow, type Reading } from "../src/interpret";
import { answerHeard } from "../src/read";
import { mayBeAnAnswer, routeUtterance } from "../src/router";
import { soundsLike } from "../src/sounds-like";
import { ACTIONS, SETTING } from "../src/router";

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

async function timed<T>(work: Promise<T>): Promise<[T, number]> {
  const started = Date.now();
  return [await work, Date.now() - started];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/clef-route") {
      const { heard, prompt, model } = (await request.json()) as { heard: string; prompt: string; model: "clef" | "clef-flash" };
      const [reply, ms] = await timed(
        env.AI.run(`@cf/cloudflare/${model}`, {
          model,
          state: `The question just asked: ${prompt}\nThe recogniser wrote what the child said: ${JSON.stringify(heard)}`,
          questions: { action: { type: "choice", instructions: `${SETTING}What should the teacher do with it?`, criteria: ACTIONS } },
        }).catch(() => null),
      );
      const probabilities = (reply as { answers?: { action?: { probabilities?: Record<string, number> } } } | null)?.answers?.action?.probabilities ?? null;
      return Response.json({ probabilities, ms });
    }
    if (new URL(request.url).pathname === "/route") {
      const { heard, prompt } = (await request.json()) as { heard: string; prompt: string };
      const [route, ms] = await timed(routeUtterance(env, { prompt, heard, language: "en", expect: { kind: "fact", item: "10" } }).catch(() => null));
      const accepted = route?.action === "mark_answer" && route.said !== undefined && soundsLike(heard, route.said);
      return Response.json({ route, ms, accepted, mayBeAnAnswer: mayBeAnAnswer(heard) });
    }
    const { heard } = (await request.json()) as { heard: string };
    const [legacy, legacyMs] = await timed(reading(env, heard, false));
    const [clef, clefMs] = await timed(reading(env, heard, true));
    return Response.json({ legacy, legacyMs, clef, clefMs });
  },
};
