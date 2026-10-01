/**
 * A list said in order, marked by code when the recording is plain.
 *
 * Counting, days of the week and the alphabet name their items, and each item lists every spelling a
 * recogniser may give it ("5" and "five", "twenty-five"). A transcript in which every word is one of
 * those spellings, or a filler, needs no model to read: code lays the words against the items. A word
 * that is neither, a garbled number, an extra number or another language, means the plain reading cannot be
 * trusted, and the answer goes to the teacher model as before.
 */
import { spokenNumber } from "./mark";
import { flattened, type SequenceItem } from "./recite";

const FILLER = new Set(["and", "then", "um", "uh", "er", "erm", "so", "okay", "ok", "the", "is"]);
// A recogniser writes the letters K, N and R as "okay", "and" and "er", so in a list of letters only these are fillers.
const FILLER_AMONG_LETTERS = new Set(["then", "um", "uh", "erm"]);
const TENS = new Set(["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]);
const ONES = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]);
const ENDS_A_HUNDRED = /^(?:hundred|thousand|\d*00)$/;

/**
 * The spellings of items the child said, in order, or null when the recording is not plain: a word that is
 * not an item or a filler, a number that is not an item, an item said twice, a number that runs on across
 * a comma or an "and" ("one hundred, and ten"), or a word in another script. Each of those is a child who
 * may have said something other than the list, or a recogniser that has split a number; the teacher model
 * reads them. A comma or full stop ends a phrase, so "twenty, five" is two items and "twenty five" is one.
 */
export function heardSequence(items: SequenceItem[], transcript: string | null, pastEnd = false): string[] | null {
  return spaced(items, transcript, pastEnd) ?? runTogether(items, transcript);
}

/** Whether a word is a number larger than every number the list holds: a child counting on, or past, the last item. */
function pastTheEnd(word: string, items: SequenceItem[]): boolean {
  // A run of digits a recogniser has joined up ("1235", "0714") is a garble, not a number the child said.
  if (/^\d{4,}$|^0\d/.test(word)) return false;
  const value = spokenNumber(word);
  const largest = Math.max(-1, ...items.flatMap((item) => item.spoken.map((spelling) => (/^\d+$/.test(spelling) ? Number(spelling) : -1))));
  return value !== null && largest >= 0 && value > largest;
}

/**
 * A recogniser sometimes writes a count as one run of digits ("0510 2025" for five, ten, twenty, twenty five). It
 * is read only when the digits are exactly the items, in order, each written plainly or, for one figure, with a
 * leading zero: the digits of the right answer, and nothing a wrong answer could make. Anything else, "0714" for a
 * count that went on to twenty-eight, or "1235" for one to five, is not the list and is left to the teacher.
 */
function runTogether(items: SequenceItem[], transcript: string | null): string[] | null {
  if (!/^[\d\s,.;]+\d[\d\s,.;]*$/.test(transcript ?? "")) return null;
  const digits = (transcript ?? "").replace(/[\s,.;]+/g, "");
  const numbers = items.map((item) => item.spoken.map(flattened).find((spelling) => /^[1-9]\d*$/.test(spelling)));
  let at = 0;
  for (const number of numbers) {
    if (number === undefined) return null;
    if (digits.startsWith(number, at)) at += number.length;
    else if (number.length === 1 && digits.startsWith(`0${number}`, at)) at += 2;
    else return null;
  }
  return at === digits.length ? (numbers as string[]) : null;
}

function spaced(items: SequenceItem[], transcript: string | null, pastEnd: boolean): string[] | null {
  const idOf = new Map(items.flatMap((item) => item.spoken.map((spelling) => [flattened(spelling), item.id] as const)));
  const longest = Math.max(1, ...[...idOf.keys()].map((spelling) => spelling.split(" ").length));
  const filler = items.some((item) => /^[a-z]$/i.test(item.id)) ? FILLER_AMONG_LETTERS : FILLER;
  const heard: string[] = [];
  let last = "";
  for (const segment of (transcript ?? "").split(/[,;.!?]+/)) {
    const words: string[] = [];
    for (const token of segment.split(/\s+/).filter(Boolean)) {
      const flat = flattened(token);
      // Letters and digits that flatten to nothing are another script: not read here.
      if (flat === "" && /[\p{L}\p{N}]/u.test(token)) return null;
      words.push(...flat.split(" ").filter(Boolean));
    }
    if (ENDS_A_HUNDRED.test(last) && words[0] === "and") return null;
    for (let at = 0; at < words.length; ) {
      const length = [...Array(longest).keys()]
        .map((k) => longest - k)
        .find((n) => at + n <= words.length && idOf.has(words.slice(at, at + n).join(" ")));
      if (!length) {
        // With `pastEnd`, a number past the end of the list is read as said, for the marker to count against the
        // child; a number inside the list that is no item is a count by ones or a garble, and is left to the teacher.
        if (pastEnd && !filler.has(words[at]) && pastTheEnd(words[at], items) && !(TENS.has(words[at]) && ONES.has(words[at + 1] ?? ""))) {
          heard.push(words[at]);
          at += 1;
          continue;
        }
        if (!filler.has(words[at])) return null;
        if (words[at] === "and" && ENDS_A_HUNDRED.test(words[at - 1] ?? "") && at + 1 < words.length) return null;
        at += 1;
        continue;
      }
      // "sixty five" is one number, and not sixty and five, when it is not an item's own spelling.
      if (length === 1 && TENS.has(words[at]) && ONES.has(words[at + 1] ?? "")) return null;
      heard.push(words.slice(at, at + length).join(" "));
      at += length;
    }
    if (words.length > 0) last = words[words.length - 1];
  }
  const ids = heard.filter((spelling) => idOf.has(spelling)).map((spelling) => idOf.get(spelling));
  return new Set(ids).size === ids.length ? heard : null;
}
