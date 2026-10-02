/**
 * What a child's words ask for: the toilet or a drink (let go) or help for being hurt, ill, hit or frightened (a grown-up).
 * The phrases are in safety-phrases.ts; they are the net under the router and answer before it, since a model asked what to do
 * with them has said to finish the question first.
 *
 * Words a recogniser writes for a number can also be a need to someone who says them. Only those attested ("pain" or "tummy"
 * for ten, "poo" for two, "sick" for six, "thirsty" for thirty) are taken for the number, and only where what was said, so
 * read, is exactly the number asked for ("forty poo" is forty-two). In a count or a table a need word among the numbers is
 * one of them, and a step's own spoken forms (the letter p is "pee") are never a need.
 */

import { spokenNumber } from "./mark";
import { DRINK, HURT, NOT_FEAR, TOILET } from "./safety-phrases";
import type { Expect } from "./turn";

export type Need = "needs_help" | "needs_grownup";

/** The number a word that is also a need stands for, where a recogniser writes it so. */
const STANDS_FOR: Record<string, string> = { pain: "ten", tummy: "ten", poo: "two", sick: "six", sicks: "six", thirsty: "thirty", thirst: "thirty" };
const FILLER = new Set([
  "it", "is", "its", "i", "think", "the", "a", "said", "say", "was", "um", "uh", "er", "answer", "please", "sir", "ma", "madam",
  "o", "oh", "na", "teacher", "aunty", "auntie",
]);
const CONNECTORS = new Set(["and", "plus", "times", "equals", "make", "makes", "are", "then"]);
const CALL = new Set(["help", "me", "somebody", "someone", "mummy", "mommy", "mum", "mom", "mama", "mother", "father", "daddy", "dad", "papa"]);
const LONGEST_RUN = 3;

function words(heard: string): string[] {
  return heard.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((word) => word !== "");
}

/** What was said, filler aside; a word said over and over is said once. */
function said(heard: string): string[] {
  return [...new Set(words(heard).filter((word) => !FILLER.has(word)))];
}

/** Whether what the child said is the number asked for, with a word for a need standing in for part of it. */
export function isOnlyTheAnswer(heard: string, answer: number | null): boolean {
  const tokens = said(heard);
  return answer !== null && tokens.some((word) => word in STANDS_FOR) && spokenNumber(tokens.map((word) => STANDS_FOR[word] ?? word).join(" ")) === answer;
}

/** The words the answer to a step may be said in: a letter's "pee" is a letter, and nothing else, in the alphabet. */
export function wordsOfTheAnswer(expect: Expect): string[] {
  const forms = expect.kind === "fact" ? [expect.item, ...(expect.accept ?? [])] : expect.kind === "sequence" ? [...(expect.before ?? []), ...expect.items, ...(expect.more ?? [])].flatMap((item) => item.spoken) : [];
  return forms.flatMap(words);
}

const without = (text: string, list: string[]) => (list.length === 0 ? text : text.replace(new RegExp(`\\b(${list.join("|")})\\b`, "gi"), " "));

/**
 * What a child's words ask for, or null where they ask for nothing of the kind. `answer` is the number a fact asks for,
 * null for a count or a table; `question` is what the child was asked; `answerWords` are the words the answer may be said in.
 */
export function needFor(heard: string, answer: number | null = null, question = "", answerWords: readonly string[] = []): Need | null {
  if (isOnlyTheAnswer(heard, answer)) return null;
  const tokens = said(heard);
  if (tokens.length > 0 && tokens.every((word) => answerWords.includes(word))) return null;
  if (tokens.length > 0 && tokens.every((word) => CALL.has(word)) && tokens.some((word) => word !== "me")) return "needs_grownup";
  const inARun = answer === null && tokens.filter((word) => spokenNumber(word) !== null || answerWords.includes(word) || CONNECTORS.has(word)).length >= LONGEST_RUN;
  const text = without(heard.replace(/’/g, "'").replace(NOT_FEAR, " "), inARun ? [...answerWords, ...Object.keys(STANDS_FOR)] : []);
  if (HURT.test(text)) return "needs_grownup";
  const water = /\bwater\b/i.test(question) ? false : said(text).join(" ") === "water";
  return TOILET.test(text) || DRINK.some((one) => one.test(text)) || water ? "needs_help" : null;
}
