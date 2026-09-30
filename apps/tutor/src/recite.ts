/**
 * Marking the answers a child gives many of at once: a whole times table, or a list said in order.
 *
 * A model reads the recording and reports what it heard, fact by fact. It does not judge any of it.
 * Every comparison here is arithmetic or string matching, so a model that wanted to be kind cannot
 * turn a miss into a pass.
 *
 * It could still be kind by inventing: reporting a fact the child never said. So a reported fact
 * carries the words it came from, and a fact whose words are not in the transcript is dropped. The
 * model can only tell us about sounds that were actually there.
 */

import type { Verdict } from "./mark";

/** What the model says it heard for one fact, and the words it heard it in. */
export interface HeardFact {
  multiplier: number;
  answer: number;
  evidence: string;
}

/** The fact-level outcome, in the shape the app already reads. */
export interface RecitationResult {
  correct_multipliers: number[];
  missing_multipliers: number[];
  incorrect_facts: { multiplier: number; expected: number; heard: number }[];
  heard_facts: { multiplier: number; heard: number; latex: string }[];
  uncertain_multipliers: number[];
}

export interface SequenceResult {
  said: string[];
  missing: string[];
  out_of_order: string[];
}

/** One item of a list, and every way a child might say it. */
export interface SequenceItem {
  id: string;
  spoken: string[];
}

/**
 * Words as a recogniser and the curriculum may spell them alike: lower case, letters and digits only. Accents
 * and dots under letters go first, or Yoruba's "méjì" (two) and "mẹ́jọ" (eight) would both become "m j".
 */
export function flattened(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Whether these words were really in the recording, so a fact cannot be conjured up for a child. */
function grounded(flatTranscript: string, evidence: string): boolean {
  const words = flattened(evidence);
  return words !== "" && ` ${flatTranscript} `.includes(` ${words} `);
}

/**
 * Mark a times table said in one breath.
 *
 * A table with nothing recognisable in it is unheard rather than twelve mistakes: a child who was
 * not picked up has not failed twelve facts.
 */
export function markRecitation(
  table: number,
  multipliers: number[],
  heard: HeardFact[],
  transcript: string,
): { verdict: Verdict; result: RecitationResult } {
  const byMultiplier = new Map<number, HeardFact>();
  const flatTranscript = flattened(transcript);
  for (const fact of heard) {
    if (grounded(flatTranscript, fact.evidence)) byMultiplier.set(fact.multiplier, fact);
  }
  const result: RecitationResult = {
    correct_multipliers: [],
    missing_multipliers: [],
    incorrect_facts: [],
    heard_facts: [],
    uncertain_multipliers: [],
  };
  for (const multiplier of multipliers) {
    const fact = byMultiplier.get(multiplier);
    if (fact === undefined) {
      result.missing_multipliers.push(multiplier);
      continue;
    }
    const expected = table * multiplier;
    result.heard_facts.push({
      multiplier,
      heard: fact.answer,
      latex: `${table} \\times ${multiplier} = ${fact.answer}`,
    });
    if (fact.answer === expected) result.correct_multipliers.push(multiplier);
    else result.incorrect_facts.push({ multiplier, expected, heard: fact.answer });
  }
  const nothingHeard = result.correct_multipliers.length + result.incorrect_facts.length === 0;
  const verdict: Verdict = nothingHeard
    ? "unheard"
    : result.missing_multipliers.length === 0 && result.incorrect_facts.length === 0
      ? "correct"
      : "wrong";
  return { verdict, result };
}

const NUMBER_WORD =
  "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and";
/** A number said that no item spells: counting by ones through a count in twos. */
const NUMBER_SPOKEN = new RegExp(`^(?:\\d+|(?:${NUMBER_WORD})(?: (?:${NUMBER_WORD}))*)$`);

/**
 * Mark a list said in order: days, months, counting.
 *
 * A number that is no item, or an item said twice, makes the list wrong: the child did not say the list.
 *
 * The model reports the words it heard, in the order it heard them. Which item each one is remains
 * a matter of matching it against the spellings the curriculum lists, so an item the child never
 * said cannot be counted for them.
 */
export function markSequence(
  items: SequenceItem[],
  heard: string[],
  transcript: string,
): { verdict: Verdict; result: SequenceResult } {
  const said: string[] = [];
  let padded = false;
  const flatTranscript = flattened(transcript);
  for (const words of heard) {
    if (!grounded(flatTranscript, words)) continue;
    const spoken = flattened(words);
    const item = items.find((one) => one.spoken.some((alias) => flattened(alias) === spoken));
    if (!item) padded ||= spoken !== "and" && NUMBER_SPOKEN.test(spoken);
    else if (said.includes(item.id)) padded = true;
    else said.push(item.id);
  }
  const order = items.map((item) => item.id);
  const missing = order.filter((id) => !said.includes(id));
  const inOrder = order.filter((id) => said.includes(id));
  const outOfOrder = said.filter((id, at) => id !== inOrder[at]);
  const verdict: Verdict = padded
    ? "wrong"
    : said.length === 0
      ? "unheard"
      : missing.length === 0 && outOfOrder.length === 0
        ? "correct"
        : "wrong";
  return { verdict, result: { said, missing, out_of_order: outOfOrder } };
}
