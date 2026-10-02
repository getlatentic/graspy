/**
 * What a child's words ask for: the toilet or a drink (let go) or help for being hurt, ill, hit or frightened (a grown-up).
 * The phrases are in safety-phrases.ts; they are the net under the router and answer before it, since a model asked what to do
 * with them has said to finish the question first.
 *
 * Words a recogniser writes for a number can also be a need to someone who says them. Only those attested ("pain" or "tummy"
 * for ten, "poo" for two, "sick" for six, "thirsty" for thirty) are taken for the number, and only where what was said, so
 * read, is exactly the number asked for ("forty poo" is forty-two). In a count or a table a need word next to the numbers is
 * one of them, and a step's own spoken forms (the letter p is "pee") are never a need.
 */

import { numberWords } from "./lines";
import { spokenNumber } from "./mark";
import { DRINK, HURT, NOT_FEAR, TOILET } from "./safety-phrases";
import type { Expect } from "./turn";

export type Need = "needs_help" | "needs_grownup";

/** The number a word that is also a need stands for, where a recogniser writes it so. */
const STANDS_FOR: Record<string, string> = { pain: "ten", tummy: "ten", poo: "two", sick: "six", sicks: "six", thirsty: "thirty", thirst: "thirty" };
const FILLER = new Set([
  "it", "is", "its", "i", "think", "the", "a", "said", "say", "was", "um", "uh", "er", "ehm", "umm", "hmm", "answer", "please", "sir",
  "ma", "madam", "o", "oh", "na", "e", "be", "don", "teacher", "aunty", "auntie", "that", "thats", "so", "okay", "ok", "my", "thank",
  "thanks", "you",
]);
const ASKS_FOR_A_GROWNUP = new Set(["help", "mummy", "mommy", "mum", "mom", "mama", "mother", "father", "daddy", "dad", "papa"]);
const CALL = new Set([...ASKS_FOR_A_GROWNUP, "me", "somebody", "someone", "abeg", "need", "want"]);
/** Words between a need word and a number that do not make it less the next number. */
const BETWEEN = new Set(["is", "are", "and", "plus", "times", "equals", "make", "makes", "then", "please", "sir", "ma", "madam", "o", "oh", "teacher", "aunty", "auntie", "thank", "thanks", "you", "um", "uh", "er", "ehm", "umm", "hmm", "ok", "okay"]);

function words(heard: string): string[] {
  return heard.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((word) => word !== "");
}

const unfilled = (heard: string) => words(heard).filter((word) => !FILLER.has(word));

/**
 * Whether what the child said is the number asked for with one word for a need standing for part of it: the only such word, and
 * the number written as it is said, so "forty poo" is forty-two and "tummy five", "pain poo" and "pain two" are no number.
 */
export function isOnlyTheAnswer(heard: string, answer: number | null): boolean {
  const tokens = unfilled(heard).filter((word, at, all) => !(word in STANDS_FOR && all[at - 1] === word));
  if (answer === null || tokens.filter((word) => word in STANDS_FOR).length !== 1) return false;
  const spoken = tokens.map((word) => STANDS_FOR[word] ?? word).join(" ");
  return spokenNumber(spoken) === answer && numberWords(answer).replace(/-/g, " ") === spoken;
}

/** The words the answer to a step may be said in: a letter's "pee" is a letter, and nothing else, in the alphabet. */
export function wordsOfTheAnswer(expect: Expect): string[] {
  const forms = expect.kind === "fact" ? [expect.item, ...(expect.accept ?? [])] : expect.kind === "sequence" ? [...(expect.before ?? []), ...expect.items, ...(expect.more ?? [])].flatMap((item) => item.spoken) : [];
  return forms.flatMap(words);
}

/**
 * Whether a phrase found in the words is only the next number or letter of a count, a table or an alphabet: one word for a need
 * or a letter's spoken form whose nearest word on either side (filler aside) is a number, a letter or another such word, as
 * "pain" in "nine pain I finished" or "pee" in "o pee q". "I am sick" after the numbers is a need: "am" is no number, and
 * "I see blood" after the letters is a need whole.
 */
function isTheRun(tokens: string[], at: number, found: string, answerWords: readonly string[]): boolean {
  const odd = (word: string) => word in STANDS_FOR || answerWords.includes(word);
  const inRun = (word: string | undefined) => word !== undefined && (spokenNumber(word) !== null || odd(word));
  const near = (step: 1 | -1) => {
    for (let to = at + step; to >= 0 && to < tokens.length; to += step) if (!BETWEEN.has(tokens[to])) return tokens[to];
    return undefined;
  };
  return found === tokens[at] && odd(found) && (inRun(near(-1)) || inRun(near(1)));
}

/** Whether the words hold one of the phrases, leaving out a phrase that is only the next step of a count (where `runs` says so). */
function holds(patterns: RegExp[], heard: string[], answerWords: readonly string[], runs: boolean): boolean {
  const tokens = heard.join(" ").replace(NOT_FEAR, " ").split(/\s+/).filter(Boolean);
  const text = tokens.join(" ");
  return patterns.some((pattern) =>
    [...text.matchAll(new RegExp(pattern.source, "gi"))].some((match) => {
      const at = text.slice(0, match.index).split(" ").length - 1;
      return !(runs && isTheRun(tokens, at, match[0], answerWords));
    }),
  );
}

/**
 * What a child's words ask for, or null where they ask for nothing of the kind. `answer` is the number a fact asks for,
 * null for a count or a table; `question` is what the child was asked; `answerWords` are the words the answer may be said in.
 */
export function needFor(heard: string, answer: number | null = null, question = "", answerWords: readonly string[] = []): Need | null {
  if (isOnlyTheAnswer(heard, answer)) return null;
  const said = unfilled(heard);
  if (said.length > 0 && said.every((word) => answerWords.includes(word))) return null;
  if (said.length > 0 && said.every((word) => CALL.has(word)) && said.some((word) => ASKS_FOR_A_GROWNUP.has(word))) return "needs_grownup";
  const tokens = words(heard);
  const runs = answer === null;
  if (holds([HURT], tokens, answerWords, runs)) return "needs_grownup";
  const water = /\bwater\b/i.test(question) ? false : tokens.filter((word) => !FILLER.has(word)).join(" ") === "water";
  return holds([TOILET, ...DRINK], tokens, answerWords, runs) || water ? "needs_help" : null;
}
