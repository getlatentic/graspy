/**
 * The one place an answer is judged, so a model can be told the verdict without deciding it.
 *
 * The model reads what the child said and hands it here. Nothing in this file consults a model, and
 * no model output can reach the verdict "correct": that is only reachable by the said value
 * matching the expected one.
 *
 * There are four verdicts because a child's turn has four honest outcomes, not two. "Unheard" is the
 * one that matters most: silence, a dropped provider call, a reading the model was unsure of, or a
 * reading with no number in it where a number was asked for, all tell us about the microphone
 * rather than the learner, so they must leave the learner's record untouched. A recogniser that
 * turns "eight" into "Aid" must never cost a child a mark.
 */

export type Verdict = "correct" | "nearly" | "wrong" | "unheard";

/** What the marker decided, what the right answer was, and what it took the child to have said. */
export interface Marking {
  verdict: Verdict;
  expected: string;
  said: string | null;
}

const TIMES_TABLE = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/;

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * The number a child spoke, however they spoke it, or null when the words are not a number.
 *
 * A child who says "fifty-six" has answered fifty-six. Leaving this to the model would make a
 * right answer depend on the model spelling it back as a digit, which is not something to stake a
 * child's record on.
 */
export function spokenNumber(said: string): number | null {
  const words = said.toLowerCase().replace(/[-,]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  let total = 0;
  let group = 0;
  let counted = false;
  for (const word of words) {
    if (word === "and") continue;
    if (/^\d+$/.test(word)) { group += Number(word); counted = true; continue; }
    if (word in UNITS) { group += UNITS[word]; counted = true; continue; }
    if (word in TENS) { group += TENS[word]; counted = true; continue; }
    if (word === "hundred") { group = (group || 1) * 100; counted = true; continue; }
    if (word === "thousand") { total += (group || 1) * 1000; group = 0; counted = true; continue; }
    return null;
  }
  return counted ? total + group : null;
}

/** The two numbers a times fact is made of, or none when the item is not one. */
export function factOperands(item: string): number[] {
  const fact = TIMES_TABLE.exec(item);
  return fact ? [Number(fact[1]), Number(fact[2])] : [];
}

/** What this item asks for. A times-table item names its own answer; a word item is itself. */
export function expectedAnswer(item: string): string {
  const fact = TIMES_TABLE.exec(item);
  if (fact) return String(Number(fact[1]) * Number(fact[2]));
  return item.trim().toLowerCase();
}

/** A number answer compares as a number however it was spoken; anything else compares as words. */
export function sameAnswer(said: string, expected: string): boolean {
  const wanted = spokenNumber(expected);
  if (wanted !== null) return spokenNumber(said) === wanted;
  return said.trim().toLowerCase().split(/\s+/).join(" ")
    === expected.trim().toLowerCase().split(/\s+/).join(" ");
}

/**
 * Judge one spoken answer against one item.
 *
 * `said` is the model's reading of the recording, not the recording. An empty reading, or one the
 * model would not stand behind, is unheard rather than wrong. `accept` carries the other spellings
 * the curriculum allows for this answer, so a child is not failed for saying it their way.
 */
export function markAnswer(
  item: string,
  said: string | null,
  sure = true,
  accept: string[] = [],
): Marking {
  const expected = expectedAnswer(item);
  const heard = said === null ? null : spokenNumber(said);
  const wanted = spokenNumber(expected);
  const nothingToJudge =
    said === null || said.trim() === "" || !sure || (wanted !== null && heard === null);
  if (nothingToJudge) return { verdict: "unheard", expected, said: null };
  const right = [expected, ...accept].some((one) => sameAnswer(said!, one));
  return {
    verdict: right ? "correct" : "wrong",
    expected,
    said: heard === null ? said!.trim() : String(heard),
  };
}
