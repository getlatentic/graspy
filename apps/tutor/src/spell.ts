/**
 * A child's line writes every number as a word, and a voice reads a line as it is written, so a line with
 * digits, signs, units or currency in it is put right by a model: a small, fast one asked to change those
 * and nothing else. Code does not write the spelling, because what "3:30", "50%" or "1st" come to in
 * words, and what any of it comes to in Yoruba, is a matter of language.
 *
 * Code does check the result. A model asked to spell "45" must not hand a child "fifty-four", nor change a
 * word beside it: the reply must read, word for word, as `expectedReading` says the line reads. A line
 * that has no such reading (a year, a phone number, "1/2", "B7") is not trusted to the model.
 *
 * The brief is the one that measured best on the datasets/number-spelling lines: it passed 93 of the 94
 * lines with a reading, with examples whose numbers are ones the model will not copy into another line.
 * English only, until it is proven there.
 */
import { expectedReading } from "./reading";
import { complete } from "./speller-host";

export function spellingBrief(text: string): string {
  return [
    "Rewrite the line below for a voice to read aloud to a child, in English. Change only the numbers, signs and units,",
    "into the words a teacher says. Keep every other word, and every comma, full stop, question mark and exclamation",
    "mark, exactly as it is.",
    "- Write every number in words.",
    "- + is plus, = is equals, x is times, - between numbers is minus, > is greater than, < is less than, % is percent.",
    "- The word naira comes after the amount: write forty naira for ₦40.",
    "- kg is kilograms, g is grams, cm is centimetres, mm is millimetres, km is kilometres, ml is millilitres.",
    "- 3:30 is three thirty, 8:00 is eight o'clock, 7:05 is seven oh five.",
    "- 5-10 is five to ten, and 1st is first.",
    "",
    "Examples:",
    "Line: You paid ₦35 for 9 mangoes.",
    "Rewritten: You paid thirty-five naira for nine mangoes.",
    "Line: 6 + 8 = 14. Is 14 > 9?",
    "Rewritten: Six plus eight equals fourteen. Is fourteen greater than nine?",
    "Line: The bell rings at 9:20, and the rope is 18 cm long!",
    "Rewritten: The bell rings at nine twenty, and the rope is eighteen centimetres long!",
    "",
    "Reply with the rewritten line only, ending exactly as the line ends.",
    `Line: "${text.replace(/"/g, "'")}"`,
    "Rewritten:",
  ].join("\n");
}

const SAME_WORD: [RegExp, string][] = [
  [/\b(\w*(?:met|lit))er(s?)\b/g, "$1re$2"],
  [/\b(kilogram|gram|centimetre|millimetre|kilometre|millilitre)s\b/g, "$1"],
  [/\bequals\b/g, "is"],
];

const NUMBER_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty",
  "seventy", "eighty", "ninety", "hundred", "thousand", "million",
]);
const DIGIT_WORDS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]);

/**
 * Words a teacher uses either way: "negative five" is "minus five" (but "five negative three" is not "five
 * minus three"), and "seven oh five" is "seven zero five" (but a bare "oh" is an interjection).
 */
function sameWords(tokens: string[]): string[] {
  return tokens.map((token, at) => {
    if (token === "negative" && !NUMBER_WORDS.has(tokens[at - 1] ?? "")) return "minus";
    if (token === "oh" && NUMBER_WORDS.has(tokens[at - 1] ?? "") && DIGIT_WORDS.has(tokens[at + 1] ?? "")) return "zero";
    return token;
  });
}

/**
 * The words and punctuation of a line, without case or hyphens, so "twenty-one" and "twenty one" read
 * alike and "twenty, one" does not. "and" goes only where "one hundred and five" puts it: elsewhere
 * "twenty and one" would read as two numbers, not twenty-one. Words a teacher uses either way (meters
 * and metres, equals and is, negative and minus) are one word.
 */
const readingOf = (text: string) => {
  let said = text.toLowerCase().replace(/[-\u2010-\u2013]/g, " ").replace(/\b(hundred|thousand|million) and\b/g, "$1");
  for (const [pattern, word] of SAME_WORD) said = said.replace(pattern, word);
  return sameWords(said.match(/[\p{L}\p{N}]+|[,.;:!?]/gu) ?? []);
};

/** Whether the reply reads exactly as the line does with every number, sign and unit written out. */
function keepsTheLine(line: string, spelled: string): boolean {
  const expected = readingOrNull(line);
  if (expected === null) return false;
  const want = readingOf(expected);
  const got = readingOf(spelled);
  return want.length === got.length && want.every((word, at) => word === got[at]);
}

function acceptable(line: string, spelled: string | null): spelled is string {
  if (!spelled || /\d/.test(spelled)) return false;
  return keepsTheLine(line, spelled);
}

/** The reading of a line, or null when it has none or code could not work it out. */
function readingOrNull(line: string): string | null {
  try {
    return expectedReading(line);
  } catch {
    return null;
  }
}

/** The line has a reading to check a spelling against. */
function checkable(line: string): boolean {
  return readingOrNull(line) !== null;
}

/** What the model said, as a line: without the quotation marks it may put round it. */
export function asLine(said: unknown): string | null {
  return typeof said === "string" ? said.trim().replace(/^"(.*)"$/s, "$1") : null;
}

/** What the automated check makes of a reply: "uncheckable" when the line has no reading to check against. */
export function verdictOf(line: string, spelled: string | null): "pass" | "fail" | "uncheckable" {
  if (!checkable(line)) return "uncheckable";
  return acceptable(line, spelled) ? "pass" : "fail";
}

/** The line with its digits written as words, or the line as it was when they cannot be trusted. */
export async function spellNumbers(env: Env, line: string, language: string): Promise<string> {
  if (language !== "en" || !/\d/.test(line) || !checkable(line)) return line;
  try {
    const spelled = asLine(await complete(env, spellingBrief(line)));
    return verdictOf(line, spelled) === "pass" ? (spelled as string) : line;
  } catch (error) {
    console.log(JSON.stringify({ part: "spell-failed", why: String(error) }));
    return line;
  }
}
