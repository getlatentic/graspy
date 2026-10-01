/**
 * What a child meant, read from the words a recogniser wrote for it.
 *
 * Recognisers write a young child's "ten" as "then", "tim" or "chain saw", and "I don't know" as "items".
 * Cloudflare's Clef decision model is asked, as a reader that is blind to the question and its answer, what the
 * child did (said a number, said they do not know, or it cannot be told) and which number, and answers with a
 * probability for every option. A reading is taken only above the thresholds below; anything less sure is
 * "unclear", which is asked again, never marked. Marking is still code's: the number is compared with the right
 * answer afterwards.
 *
 * The thresholds were chosen on the staging rig's recognised answers (apps/tutor/bench): at these, 3 of 70 were
 * read as a wrong answer, none as not knowing, and 26 asked again.
 */

import { heardForPrompt } from "./guard";

export const CLEF_MODEL = "@cf/cloudflare/clef";
/** How sure Clef must be of what the child did, and then of which number. */
export const KIND_MIN = 0.8;
export const VALUE_MIN = 0.5;
/** The numbers Clef is offered as the child's answer: a times table ends at 12 x 12. A question whose answer is larger goes to the small reader, which reads up to 999. */
export const LARGEST_NUMBER = 150;

export type Reading = { kind: "number"; value: number } | { kind: "dont_know" } | { kind: "unclear" };

/** What a recogniser writes for a number said alone, when it is the whole answer: a sound-alike that is no other word a child would say. */
export const HOMOPHONES: Record<string, number> = { to: 2, too: 2, for: 4, fore: 4, won: 1, ate: 8, nein: 9 };

/**
 * Whether the child said nothing but that they do not know. Anything more ("I don't know, is it a triangle",
 * "not sure, fiften") may be an answer, and goes to be read and marked.
 */
const ONLY_NOT_KNOWING =
  /^(?:(?:um+|uh+|er+|erm|well|sorry)\s+)*(?:i\s+)?(?:really\s+)?(?:(?:do\s*not|don'?t|dont|can'?t|cannot|cant)\s+(?:know|remember)(?:\s+it)?|dunno|have\s+no\s+idea|no\s+idea|(?:i'?m\s+)?not\s+sure|forgot)(?:\s+(?:miss|sir|ma'?am|auntie|teacher))?$/;

export function saidOnlyThatTheyDoNotKnow(heard: string | null): boolean {
  const plain = heardForPrompt(heard).toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
  return ONLY_NOT_KNOWING.test(plain);
}

/** The most words of a recording that nobody could read for which the phrasebook's "say it again" still fits; more is a child saying something else. */
const MOST_WORDS_ASKED_AGAIN = 3;

export function fewWords(heard: string | null): boolean {
  return heardForPrompt(heard).split(/[^\p{L}\p{N}']+/u).filter((word) => word !== "").length <= MOST_WORDS_ASKED_AGAIN;
}

const INSTRUCTIONS =
  "A young Nigerian child answered a maths question out loud and a speech recogniser wrote down what it heard, often wrongly. " +
  "Judge only from how the written words sound read aloud; you are not told the question. Recognisers mishear Nigerian " +
  "children in regular ways: Aid/ate = 8, tree/free = 3, to/too = 2, sicks = 6, tin/teen/tim/then = 10, nein/nain = 9, " +
  "faif = 5, seben = 7.";

const KINDS = {
  number: "said a number",
  dont_know: "said they do not know, cannot remember or are not sure, with no number",
  unclear: "anything else, or it cannot be told",
};

const VALUES: Record<string, string> = { none: "no number", ...Object.fromEntries(Array.from({ length: LARGEST_NUMBER + 1 }, (_, n) => [String(n), String(n)])) };

type Probabilities = Record<string, number>;
interface ClefReply {
  answers?: { kind?: { probabilities?: Probabilities }; value?: { probabilities?: Probabilities } };
}

function top(probabilities: Probabilities | undefined): [string, number] | null {
  const entries = Object.entries(probabilities ?? {});
  return entries.length === 0 ? null : entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
}

/** The reading of what the recogniser wrote, or null when the model gave no usable answer, which the caller answers another way. */
export async function readWithClef(env: Env, heard: string): Promise<Reading | null> {
  const reply = (await env.AI.run(CLEF_MODEL, {
    model: "clef",
    state: `The recogniser wrote: ${heard}`,
    questions: {
      kind: { type: "choice", instructions: `${INSTRUCTIONS} What did the child do?`, criteria: KINDS },
      value: { type: "choice", instructions: `${INSTRUCTIONS} Which number did the child say, if any?`, criteria: VALUES },
    },
  })) as ClefReply;
  const kind = top(reply.answers?.kind?.probabilities);
  if (kind === null) return null;
  const [what, sure] = kind;
  if (sure < KIND_MIN) return { kind: "unclear" };
  if (what === "dont_know") return { kind: "dont_know" };
  if (what !== "number") return { kind: "unclear" };
  const value = top(reply.answers?.value?.probabilities);
  if (value === null || value[0] === "none" || value[1] < VALUE_MIN) return { kind: "unclear" };
  return { kind: "number", value: Number(value[0]) };
}
