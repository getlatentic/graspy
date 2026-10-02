/**
 * Phrases that say a child needs the toilet or water, or is hurt, ill or frightened. They are the net under the router
 * and what answers before it: a model asked what to do with them has said to finish the question first. Pain, bleeding,
 * being hit and fear send the child to a grown-up; the toilet or a drink lets them go.
 *
 * The list holds phrases that are a need and nothing else. Topical words (a snake, a stomach, water in a word problem) are
 * not in it, and water is a need only where the child asks for it. A word the recogniser writes for a number ("pain" for
 * ten, "poo" for two) is the answer when it is all the child said and the number asked for, or one word among the numbers of
 * a count or a table; a word that is a need in every other mouth ("toilet", "bleeding") never is.
 */

import { spokenNumber } from "./mark";
import { soundsLike } from "./sounds-like";

export type Need = "needs_help" | "needs_grownup";

const TOILET = new RegExp(
  "\\b(" +
    [
      "toilets?", "bathrooms?", "restrooms?", "washrooms?", "loo", "latrine", "pee", "peed", "peeing", "piss", "pissing",
      "poo", "pooh", "poop", "shit", "wee", "urinate", "diarrhoea", "diarrhea", "thirsty", "thirst", "puke", "throw up",
      "ease myself", "wan ease", "wet myself", "pass urine", "number (one|two)", "(short|long) call", "nature is calling",
      "(want|wan|need) to go out",
    ].join("|") +
    ")\\b",
  "i",
);
const DRINK = [
  "\\b(i|we)\\s+(need|want|wan|would like|will like)\\s+(to\\s+)?(some |a |the |my )?(drink|water)\\b",
  "\\bcan i (have|get|drink|take)\\s+(some |a |the |my )?(water|drink)\\b",
  "\\b(bring|give|fetch) me\\s+(some |a |the |my )?water\\b",
  "\\babeg\\s+(some |a )?water\\b",
].map((source) => new RegExp(source, "i"));
const HURT = new RegExp(
  "\\b(" +
    [
      "hurt", "hurts", "hurting", "pain", "paining", "painful", "ache", "aching", "aches", "toothache", "fever", "vomit",
      "vomiting", "dizzy", "sick", "headache", "bleeding", "bleed", "scared", "afraid", "frightened", "unwell", "injured",
      "fainted", "choking", "belly", "help me", "(can't|cannot|cant) breathe", "cut myself", "not feeling well", "no well",
      "(don't|do not|dont|am not|im not|i'm not) (feel )?well", "(am|is|im|feel|feeling|been) ill", "feel bad",
      "(hit|hits|hitting|beat|beating|beats|slap|slapped|push|pushed|pushing|kick|kicked|kicking|bit|bite|bites|punched|stabbed|touched|flogged|pinched) me",
      "i was (beaten|hit|slapped|pushed|kicked)", "(want|call|need|bring) (my )?(mummy|mommy|mum|mama|daddy|teacher)",
    ].join("|") +
    ")\\b",
  "i",
);

/** Words the recogniser writes for a number that are also a need to someone who says them: these may be the answer. */
const MISHEARD_AS_NUMBER = new Set(["pain", "paining", "tummy", "poo", "poop", "pee", "wee", "sick", "ill", "water"]);
const FOR_NUMBER: Record<string, number> = { sick: 6 };
const FILLER = new Set([
  "it", "is", "its", "i", "think", "the", "a", "said", "say", "was", "um", "uh", "er", "answer", "please", "sir", "ma", "madam",
  "o", "oh", "na", "teacher", "aunty", "auntie",
]);
const CONNECTORS = new Set(["and", "plus", "times", "equals", "make", "makes", "is", "are", "then"]);
const NOT_FEAR = /\b(i am|i['’]?m) afraid (it|that|its|this)\b/gi;

function words(heard: string): string[] {
  return heard.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((word) => word !== "");
}

/** What was said, filler aside; a word said over and over is said once. */
function said(heard: string): string[] {
  return [...new Set(words(heard).filter((word) => !FILLER.has(word)))];
}

function forTheNumber(word: string, answer: number): boolean {
  return soundsLike(word, answer) || FOR_NUMBER[word] === answer;
}

/** Whether all the child said is one word that is the answer asked for, misheard: "pain" for ten, "poo" for two. */
export function isOnlyTheAnswer(heard: string, answer: number | null): boolean {
  const [word, ...more] = said(heard);
  return word !== undefined && more.length === 0 && answer !== null && MISHEARD_AS_NUMBER.has(word) && forTheNumber(word, answer);
}

/** A count or a table with one such word among its numbers, which is the number it stands where: nothing here to answer. */
function amongNumbers(heard: string, answer: number | null): boolean {
  if (answer !== null) return false;
  const tokens = said(heard);
  const odd = tokens.filter((word) => MISHEARD_AS_NUMBER.has(word));
  return odd.length === 1 && tokens.some((word) => spokenNumber(word) !== null) && tokens.every((word) => word === odd[0] || CONNECTORS.has(word) || spokenNumber(word) !== null);
}

/**
 * What a child's words ask for, or null where they ask for nothing of the kind. `answer` is the number a fact asks for,
 * null for a count or a table; `question` is what the child was asked.
 */
export function needFor(heard: string, answer: number | null = null, question = ""): Need | null {
  if (isOnlyTheAnswer(heard, answer) || amongNumbers(heard, answer)) return null;
  const text = heard.replace(NOT_FEAR, " ");
  if (HURT.test(text)) return "needs_grownup";
  const water = /\bwater\b/i.test(question) ? false : said(text).join(" ") === "water";
  return TOILET.test(text) || DRINK.some((one) => one.test(text)) || water ? "needs_help" : null;
}
