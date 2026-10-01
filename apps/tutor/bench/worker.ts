import { HOMOPHONES, saidOnlyThatTheyDoNotKnow, readWithClef, type Reading } from "../src/interpret";
import { answerHeard } from "../src/read";

/** What the tutor reads today for a recognised answer, without the question: the table, then the small reader, then the plain "I don't know". */
async function legacyReading(env: Env, heard: string): Promise<Reading> {
  const homophone = HOMOPHONES[heard.toLowerCase().replace(/[^a-z]/g, "")];
  const number = homophone ?? (await answerHeard(env, heard));
  if (number !== null) return { kind: "number", value: number };
  return saidOnlyThatTheyDoNotKnow(heard) ? { kind: "dont_know" } : { kind: "unclear" };
}

async function timed<T>(work: Promise<T>): Promise<[T, number]> {
  const started = Date.now();
  return [await work, Date.now() - started];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { heard } = (await request.json()) as { heard: string };
    const [legacy, legacyMs] = await timed(legacyReading(env, heard).catch(() => null));
    const [clef, clefMs] = await timed(readWithClef(env, heard).catch(() => null));
    return Response.json({ legacy, legacyMs, clef, clefMs });
  },
};
