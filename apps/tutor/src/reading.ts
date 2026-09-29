/**
 * What a line must read as once its digits, signs and units are spoken words, or null when code cannot
 * say. A model spells the line; this is what its spelling is held to, word for word.
 *
 * The rule is to read only what is well defined and to decline the rest. A line declined here goes to the
 * teacher model unchanged, which is safe; a line read wrongly could put a wrong number in a child's ear.
 * So this reads whole numbers up to nine figures, decimals, percentages, naira amounts, times that a word
 * marks as a time, ranges that a word marks as a range, ordinals, the signs between numbers (plus, equals,
 * times, minus, greater than, less than) and a few lower-case units. It declines anything with a second
 * reading: years, phone and emergency numbers, dates, ratios, slash fractions, letters joined to digits,
 * two numbers side by side, and every symbol it has no words for.
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
const NUMBER = String.raw`[1-9]\d{0,2}(?:,\d{3}){1,2}|[1-9]\d{0,2}|0`;
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

/** "1st", "2nd", "3rd", "4th": a suffix that does not belong to the number is left as it is. */
function ordinalOf(n: string, suffix: string): string {
  const k = Number(n);
  const right = k % 100 >= 11 && k % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[k % 10] ?? "th";
  return suffix === right ? ordinalWords(k) : `${n}${suffix}`;
}

// "3-7" is a range on a page or an age and a subtraction in a sum, and only the words beside it say which: it
// is a range only when one of these is among the two words before it, and otherwise it stays as digits.
const RANGE_CUE = /\b(?:ages?|pages?|classes|class|grades?|chapters?|lessons?|days?|years?|rows?|steps?|questions?|numbers?|from|count|counting)\b/i;
const RANGE = /(?<![\w.,:-])([1-9]\d{0,2}|0)-([1-9]\d{0,2}|0)(?![\w:%/]|-\d|[.,]\d)/g;

function rangesFirst(line: string): string {
  return line.replace(RANGE, (matched, low: string, high: string, at: number, all: string) => {
    const before = (all.slice(0, at).split(/[.!?]/).pop() ?? "").trim().split(/\s+/).slice(-2).join(" ");
    return Number(low) < Number(high) && RANGE_CUE.test(before) ? `${whole(low)} to ${whole(high)}` : matched;
  });
}

type Step = [RegExp, (...groups: string[]) => string];

// Signs first, while the digits beside them are still there to be seen.
const SIGNS: Step[] = [
  [/(?<=\d)\s*\+\s*(?=\d)/g, () => " plus "],
  [/(?<=\d)\s*=\s*(?=\d)/g, () => " equals "],
  [/(?<=\d)\s*[xX×*]\s*(?=\d)/g, () => " times "],
  [/(?<=\d) - (?=\d)/g, () => " minus "],
  [/(?<=\d)\s*>\s*(?=\d)/g, () => " greater than "],
  [/(?<=\d)\s*<\s*(?=\d)/g, () => " less than "],
];

const FORMS: Step[] = [
  // A minus sign comes first: the steps below turn the digits after it into words and would leave it bare.
  [/(?<![\w.])-(?=\d)/g, () => "minus "],
  [/(?<![\w.:])(\d{1,2}):(\d{2})(?![\w:])/g, timeWords],
  [new RegExp(String.raw`(?<![\w.,])₦(${NUMBER})(?![\d.,]\d|\w)`, "g"), (n) => `${whole(n)} naira`],
  [/(?<![\w.,])(\d{1,3})%(?!\w)/g, (n) => `${whole(n)} percent`],
  [new RegExp(String.raw`(?<![\w.,])(${NUMBER})\s?(kg|mm|cm|km|ml|g)\b`, "g"), (n, u) => `${whole(n)} ${UNIT_WORDS[u]}`],
  [/(?<![\w.,])(\d{1,3})\.(\d{1,9})\s?(kg|mm|cm|km|ml|g)\b/g, (i, f, u) => `${whole(i)} point ${digitWords(f)} ${UNIT_WORDS[u]}`],
  [/(?<![\w.,])(\d{1,3})\.(\d{1,9})(?![\w]|[.,]\d)/g, (i, f) => `${whole(i)} point ${digitWords(f)}`],
  [/(?<![\w.,])(\d{1,2})(st|nd|rd|th)\b/g, ordinalOf],
  [new RegExp(String.raw`(?<![\w.,:;%/\-₦$£€])(${NUMBER})(?![\w:%/]|[.,]\d)`, "g"), whole],
];

// "may" is a month only with a capital: "Ages 6-8 may join" is a verb.
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const TIME_CUE = /\b(?:at|by|until|till|time|past|hours?|clock|o'clock|am|pm|now|start|starts|ends?|begins?|rings?|closes?|opens?|lunch|break|morning|afternoon|evening|night)\b/i;
const RATIO_CUE = /\b(?:ratio|mix|mixture|score|scores|scored|for every|per)\b/i;

// Lines with a second meaning, declined before any reading is made.
const AMBIGUOUS: RegExp[] = [
  /\d\s*\/|\/\s*\d/, // 1/2 is a half, or one over two; km/h
  /\d00\s+and\b/i, // "100 and 20" and "one hundred and twenty" read alike
  /\d\s+\d/, // two numbers side by side, or a space for a thousands separator
  /\d['’"”]/, // 5'6", 5's, "5"
  /\d\s+:\s*\d|\d\s*:\s+\d/, // 3 : 4, a ratio or a score; but "Count in twos: 2, 4" is a list
  /\b(?:call|dial|ring|phone|text|emergency)\b[^.!?]*\b\d{3}\b/i, // 112 is "one one two", not a hundred and twelve
  /\bNo\.?\s*\d|\bN\s?\d/, // No. 5, N500: number, or naira
  new RegExp(String.raw`\b${MONTH}\.?\s+(?:the\s+)?\d|\d(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH}\b`, "i"), // dates are said "the fifth of June"
  /\bMay\.?\s+(?:the\s+)?\d|\d(?:st|nd|rd|th)?\s+(?:of\s+)?May\b/,
  /(?<![\w.,:])0\d/, // 007, 05, 00.5
  /\d\s?(?:m|l|mg|min|mins|hr|hrs|lb|lbs|kgs|KG|Kg|mL|L)\b/, // units with no words here
  /\d\.\d{1,2}\s?(?:am|pm|a\.m\.|p\.m\.)|\b(?:at|by)\s+\d+\.\d|\d\.\d0\b/i, // times and money written as decimals
];

/** A time is read only when a word says it is one, and never in a ratio. */
function unreadableTime(line: string): boolean {
  return /\d:\d\d/.test(line) && !(TIME_CUE.test(line) && !RATIO_CUE.test(line));
}

/** "5 - 3" is a subtraction only between whole numbers with the larger first; "8:00 - 9:00" and "5 - 10" are ranges. */
function badSubtraction(line: string): boolean {
  for (const [, left, right] of line.matchAll(/(\S+)\s-\s(\S+)/g)) {
    if (!/\d/.test(left) && !/\d/.test(right)) continue;
    const a = left.replace(/[,.!?;:]+$/, "");
    const b = right.replace(/[,.!?;:]+$/, "");
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || Number(a) < Number(b)) return true;
  }
  return false;
}

// A dash still beside a digit, a percent or a unit is a sign or a range nothing above vouched for.
const STRAY_DASH = /\d(?:st|nd|rd|th)?-\d|(?<=[\d%])-(?![A-Za-z]{2})|(?<=\d\s?(?:kg|mm|cm|km|ml|g))-(?![A-Za-z]{2})|(?<=\d(?:st|nd|rd|th))-/;
// Only letters, spaces and plain punctuation may be left in a reading: any other character is one nothing
// above has words for, and a reply cannot be held to it. A lone "x" is algebra, not "times".
const NOT_SPEAKABLE = /[^\p{L}\s.,!?;:'"()-]|(?<!\p{L})-|-(?!\p{L})|\bx\b/iu;

/** The capture groups of a match, without the match itself or the position and string String.replace adds. */
function groupsOf(rest: unknown[]): string[] {
  const end = rest.findIndex((part) => typeof part === "number");
  return rest.slice(0, end).map((group) => String(group ?? ""));
}

export function expectedReading(line: string): string | null {
  if (AMBIGUOUS.some((pattern) => pattern.test(line)) || unreadableTime(line)) return null;
  if (badSubtraction(line) || (/\d-\d/.test(line) && /[=+×*<>]/.test(line))) return null;
  let text = rangesFirst(line);
  // A dash still between numbers is not a range a cue vouched for: a subtraction, a date, a code.
  if (STRAY_DASH.test(text)) return null;
  for (const [pattern, words] of [...SIGNS, ...FORMS]) {
    text = text.replace(pattern, (_match: string, ...rest: unknown[]) => words(...groupsOf(rest)));
  }
  return NOT_SPEAKABLE.test(text) ? null : text.replace(/\s+/g, " ").trim();
}
