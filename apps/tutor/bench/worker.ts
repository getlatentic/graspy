import { HOMOPHONES, readWithClef, saidOnlyThatTheyDoNotKnow, type Reading } from "../src/interpret";
import { answerHeard } from "../src/read";

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
    const { heard } = (await request.json()) as { heard: string };
    const [legacy, legacyMs] = await timed(reading(env, heard, false));
    const [clef, clefMs] = await timed(reading(env, heard, true));
    return Response.json({ legacy, legacyMs, clef, clefMs });
  },
};
