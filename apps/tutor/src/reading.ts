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
// Nine figures at most, with commas, so a number never outgrows what numberWords can write.
const NUMBER = String.raw`\d{1,3}(?:,\d{3}){1,2}|[1-9]\d{0,2}|0`;
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

/** "5-10" is "five to ten"; "10-5" is a subtraction or a mistake, so it is left as digits and the line is declined. */
function rangeWords(low: string, high: string): string {
  return Number(low) < Number(high) ? `${whole(low)} to ${whole(high)}` : `${low}-${high}`;
}

/** "1st", "2nd", "3rd", "4th": a suffix that does not belong to the number is left as it is. */
function ordinalOf(n: string, suffix: string): string {
  const k = Number(n);
  const right = k % 100 >= 11 && k % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[k % 10] ?? "th";
  return suffix === right ? ordinalWords(k) : `${n}${suffix}`;
}

const FORMS: Step[] = [
  // A minus sign comes first: the steps below turn the digits after it into words and would leave it bare.
  [/(?<![\w.])-(?=\d)/g, () => "minus "],
  [/(?<![\w.:])(\d{1,2}):(\d{2})(?![\w:])/g, timeWords],
  [/(?<![\w-])(\d{1,3})-(\d{1,3})(?![\w-])/g, rangeWords],
  [new RegExp(String.raw`₦(${NUMBER})(?![\d.,]\d|\w)`, "g"), (n) => `${whole(n)} naira`],
  [/(?<![\w.,])(\d{1,3})%/g, (n) => `${whole(n)} percent`],
  [new RegExp(String.raw`(?<![\w.,])(${NUMBER})\s?(kg|mm|cm|km|ml|g)\b`, "g"), (n, u) => `${whole(n)} ${UNIT_WORDS[u]}`],
  [/(?<![\w.,])(\d{1,3})\.(\d{1,9})(?![\w]|[.,]\d)/g, (i, f) => `${whole(i)} point ${digitWords(f)}`],
  [/(?<![\w.,])(\d{1,2})(st|nd|rd|th)\b/g, ordinalOf],
  [new RegExp(String.raw`(?<![\w.,:;%/\-₦$£€])(${NUMBER})(?![\w:%/]|[.,]\d)`, "g"), whole],
];

/** The capture groups of a match, without the match itself or the position and string String.replace adds. */
function groupsOf(rest: unknown[]): string[] {
  const end = rest.findIndex((part) => typeof part === "number");
  return rest.slice(0, end).map((group) => String(group ?? ""));
}

// Readings with a second meaning, or a symbol the steps above do not know: declined.
const AMBIGUOUS = [
  /\d\/|\/\d/,                        // 1/2 is a half, or one over two
  /\d00\s+and\s+\d/,                   // "100 and 20" and "one hundred and twenty" read alike
  /\d{1,3} \d{3}(?!\d)/,               // 12 345 with a space for a thousands separator
  /\d-\d[^\n]*[=+×*<>]|[=+×*<>][^\n]*\d-\d/, // a dash beside an operator is a minus, not a range
];
const LEFT_OVER_SYMBOL = /[%₦$£€=<>+×÷−±&°]/;

export function expectedReading(line: string): string | null {
  if (AMBIGUOUS.some((pattern) => pattern.test(line))) return null;
  let text = line;
  for (const [pattern, words] of [...SIGNS, ...FORMS]) {
    text = text.replace(pattern, (_match: string, ...rest: unknown[]) => words(...groupsOf(rest)));
  }
  return /\d/.test(text) || LEFT_OVER_SYMBOL.test(text) ? null : text.replace(/\s+/g, " ").trim();
}
