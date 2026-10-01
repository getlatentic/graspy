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
 * It is asked only about a word or two (a longer sentence holds a number the small reader can check against the
 * words), and only in English. The thresholds were chosen on the staging rig's recognised answers
 * (apps/tutor/bench); see its README for what they score.
 */

import { heardForPrompt } from "./guard";

export const CLEF_MODEL = "@cf/cloudflare/clef";
/** How sure Clef must be of what the child did, and then of which number. */
export const KIND_MIN = 0.8;
export const VALUE_MIN = 0.5;
/** And how far the number must lead the next most likely, "no number" included: a near tie is a child who said another. */
export const VALUE_LEAD = 0.2;
/** A reading that is not given within this is left to the small reader; Clef answers in well under a second as a rule. */
const CLEF_TIMEOUT_MS = 4000;
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
  "A young Nigerian child answered a maths question out loud and a speech recogniser wrote down what it heard, often " +
  "wrongly: a number word is often written as another word that sounds like it. Judge only from how the written words " +
  "would sound read aloud by a child; you are not told the question or the answer.";

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

/** The two most likely options of an answer, or null where the numbers are no probabilities: a few options, none negative, adding up to one. */
function lead(probabilities: Probabilities | undefined): [[string, number], number] | null {
  const entries = Object.entries(probabilities ?? {});
  const total = entries.reduce((sum, [, p]) => sum + p, 0);
  if (entries.length === 0 || entries.some(([, p]) => !(p >= 0)) || Math.abs(total - 1) > 0.1) return null;
  const [first, second] = [...entries].sort((a, b) => b[1] - a[1]);
  return [first, first[1] - (second?.[1] ?? 0)];
}

function afterTimeout<T>(work: Promise<T>): Promise<T | null> {
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), CLEF_TIMEOUT_MS))]);
}

/**
 * The reading of what the recogniser wrote, or null when it is not to be used: another language, more than a few
 * words, no answer in time, or an answer that is no probability. The caller then reads it another way.
 */
export async function readWithClef(env: Env, heard: string, language = "en"): Promise<Reading | null> {
  if (language !== "en" || !fewWords(heard)) return null;
  const reply = (await afterTimeout(
    env.AI.run(CLEF_MODEL, {
      model: "clef",
      state: `The recogniser wrote: ${heard}`,
      questions: {
        kind: { type: "choice", instructions: `${INSTRUCTIONS} What did the child do?`, criteria: KINDS },
        value: { type: "choice", instructions: `${INSTRUCTIONS} Which number did the child say, if any?`, criteria: VALUES },
      },
    }),
  )) as ClefReply | null;
  const kind = lead(reply?.answers?.kind?.probabilities);
  if (kind === null) return null;
  const [[what, sure]] = kind;
  if (sure < KIND_MIN) return { kind: "unclear" };
  if (what === "dont_know") return { kind: "dont_know" };
  if (what !== "number") return { kind: "unclear" };
  const value = lead(reply?.answers?.value?.probabilities);
  if (value === null) return null;
  const [[number, p], margin] = value;
  if (!/^\d+$/.test(number) || p < VALUE_MIN || margin < VALUE_LEAD) return { kind: "unclear" };
  return { kind: "number", value: Number(number) };
}
