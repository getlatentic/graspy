import type { Verdict } from "./mark";

/** What Aunty Chioma says when her own line for this answer cannot be used: kind, short, and true for any question. */
export const STEADY_LINES: Record<Verdict, Record<"en" | "yo" | "pcm", string>> = {
  correct: { en: "Well done. We move on now.", yo: "O ṣe dáadáa. A ó lọ síwájú báyìí.", pcm: "You don do well. We go move on now." },
  nearly: { en: "You were close. Try once more.", yo: "O sún mọ́ ọn. A ó tún gbìyànjú.", pcm: "You nearly get am. We go try am again." },
  wrong: { en: "That one was tricky. We learn it together.", yo: "Ó ṣòro díẹ̀. A ó jọ kọ́ ọ́.", pcm: "That one hard small. We go learn am together." },
  unheard: { en: "I did not hear you. Tap and say it again.", yo: "Mi ò gbọ́ ọ. Tẹ̀ ẹ́, kí o sì tún sọ ọ́.", pcm: "I no hear you. Tap and say am again." },
};

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number as English words, up to nine figures. */
export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ""}`;
  for (const [size, name] of [[1_000_000, "million"], [1000, "thousand"]] as const) {
    if (n >= size) return `${numberWords(Math.floor(n / size))} ${name}${n % size ? ` ${numberWords(n % size)}` : ""}`;
  }
  return String(n);
}

const ORDINAL_ONES = [
  "zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh",
  "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
];

/** A number as an English ordinal, "first" to "ninety-ninth". */
export function ordinalWords(n: number): string {
  if (n < 20) return ORDINAL_ONES[n];
  const units = n % 10;
  if (units === 0) return TENS[n / 10].replace(/y$/, "ieth");
  return `${TENS[Math.floor(n / 10)]}-${ORDINAL_ONES[units]}`;
}
