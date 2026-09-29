/**
 * What a line must read as once its digits, symbols and units are spoken words, or null when code cannot
 * say. A model spells the line; this is what its spelling is held to, word for word.
 *
 * Only readings a teacher would give the same way each time are written here: whole numbers up to nine
 * figures, decimals, percentages, naira amounts, times, ranges, ordinals, the signs between numbers
 * (plus, equals, times, minus, greater than, less than) and a few units. Years, phone numbers, fractions
 * written with a slash, and letters joined to digits have several readings, so a line holding one has
 * none: code declines it and the teacher rewrites it.
 */
import { numberWords, ordinalWords } from "./lines";

const UNIT_WORDS: Record<string, string> = {
  kg: "kilograms",
  g: "grams",
  mm: "millimetres",
  cm: "centimetres",
  km: "kilometres",
  ml: "millilitres",
};
// Four or more figures without commas are as likely a year, an ID or a code as a quantity: left to the teacher.
const NUMBER = String.raw`\d{1,3}(?:,\d{3})+|[1-9]\d{0,2}|0`;
const digitWords = (digits: string) => [...digits].map((d) => numberWords(Number(d))).join(" ");
const whole = (text: string) => numberWords(Number(text.replace(/,/g, "")));

/** "3:30" is "three thirty", "8:00" is "eight o'clock", "7:05" is "seven oh five". */
function timeWords(hours: string, minutes: string): string {
  const h = Number(hours);
  const m = Number(minutes);
  if (h < 1 || h > 12 || m > 59) return `${hours}:${minutes}`;
  if (m === 0) return `${numberWords(h)} o'clock`;
  return `${numberWords(h)} ${m < 10 ? `oh ${numberWords(m)}` : numberWords(m)}`;
}

type Step = [RegExp, (...groups: string[]) => string];

// Signs first, while the digits beside them are still there to be seen.
const SIGNS: Step[] = [
  [/(?<=\d)\s*\+\s*(?=\d)/g, () => " plus "],
  [/(?<=\d)\s*=\s*(?=\d)/g, () => " equals "],
  [/(?<=\d)\s*[x×*]\s*(?=\d)/g, () => " times "],
  [/(?<=\d) - (?=\d)/g, () => " minus "],
  [/(?<=\d)\s*>\s*(?=\d)/g, () => " greater than "],
  [/(?<=\d)\s*<\s*(?=\d)/g, () => " less than "],
];

// A year has more than one reading, so it is left as digits and the line goes to the teacher.
const NOT_A_YEAR = String.raw`(?!(?:19|20)\d\d(?![\d,]))`;

const FORMS: Step[] = [
  [/(?<![\w.:])(\d{1,2}):(\d{2})(?![\w:])/g, timeWords],
  [/(?<![\w-])(\d{1,3})-(\d{1,3})(?![\w-])/g, (a, b) => `${whole(a)} to ${whole(b)}`],
  [new RegExp(String.raw`₦(${NUMBER})(?![\d.,]\d|\w)`, "g"), (n) => `${whole(n)} naira`],
  [/(?<![\w.,])(\d{1,3})%/g, (n) => `${whole(n)} percent`],
  [new RegExp(String.raw`(?<![\w.,])(${NUMBER})\s?(kg|mm|cm|km|ml|g)\b`, "g"), (n, u) => `${whole(n)} ${UNIT_WORDS[u]}`],
  [/(?<![\w.,])(\d{1,3})\.(\d{1,9})(?![\w.,]\d)/g, (i, f) => `${whole(i)} point ${digitWords(f)}`],
  [/(?<![\w.,])(\d{1,2})(st|nd|rd|th)\b/g, (n) => ordinalWords(Number(n))],
  [/(?<![\w.])-(?=\d)/g, () => "minus "],
  [new RegExp(String.raw`(?<![\w.,:;%/\-₦$£€])${NOT_A_YEAR}(${NUMBER})(?![\w:%/]|[.,]\d)`, "g"), whole],
];

/** The capture groups of a match, without the match itself or the position and string String.replace adds. */
function groupsOf(rest: unknown[]): string[] {
  const end = rest.findIndex((part) => typeof part === "number");
  return rest.slice(0, end).map((group) => String(group ?? ""));
}

export function expectedReading(line: string): string | null {
  if (/\d\/|\/\d/.test(line)) return null;
  let text = line;
  for (const [pattern, words] of [...SIGNS, ...FORMS]) {
    text = text.replace(pattern, (_match: string, ...rest: unknown[]) => words(...groupsOf(rest)));
  }
  return /\d/.test(text) ? null : text.replace(/\s+/g, " ").trim();
}
