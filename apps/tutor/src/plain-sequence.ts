/**
 * A list said in order, marked by code when the recording is plain.
 *
 * Counting, days of the week and the alphabet name their items, and each item lists every spelling a
 * recogniser may give it ("5" and "five", "twenty-five"). A transcript in which every word is one of
 * those spellings, or a filler, needs no model to read: code lays the words against the items. A word
 * that is neither, a garbled number or another language, means the plain reading cannot be trusted,
 * and the answer goes to the teacher model as before.
 */
import { flattened, type SequenceItem } from "./recite";

const FILLER = new Set(["and", "then", "um", "uh", "er", "erm", "so", "okay", "ok", "the", "is"]);
/**
 * A number that is not one of the items, "6" in a count to five, is plainly a wrong answer and is kept as
 * heard, where the marker ignores it. Four or more figures, or a leading zero, are as likely a recogniser
 * running numbers together ("1235", "05") and are not plain.
 */
const NUMBER_LIKE = /^(?:[1-9]\d{0,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)$/;
const TENS = new Set(["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]);
const ONES = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]);

/**
 * The spellings of items the child said, in order, or null when the recording is not plain: a word that is
 * not an item, a filler or a small number, a hundred or a thousand said other than as an item's own
 * spelling, or a word in another script. A comma or full stop ends a phrase, so "twenty, five" is two items
 * and "twenty five" is one.
 */
export function heardSequence(items: SequenceItem[], transcript: string | null): string[] | null {
  const spellings = new Set(items.flatMap((item) => item.spoken.map(flattened)));
  const longest = Math.max(1, ...[...spellings].map((spelling) => spelling.split(" ").length));
  const heard: string[] = [];
  for (const segment of (transcript ?? "").split(/[,;.!?]+/)) {
    const words: string[] = [];
    for (const token of segment.split(/\s+/).filter(Boolean)) {
      const flat = flattened(token);
      // Letters and digits that flatten to nothing are another script: not read here.
      if (flat === "" && /[\p{L}\p{N}]/u.test(token)) return null;
      words.push(...flat.split(" ").filter(Boolean));
    }
    for (let at = 0; at < words.length; ) {
      const length = [...Array(longest).keys()]
        .map((k) => longest - k)
        .find((n) => at + n <= words.length && spellings.has(words.slice(at, at + n).join(" ")));
      const whole = length ? words.slice(at, at + length).join(" ") : "";
      // "sixty five" is one number, and not sixty and five, when it is not an item's own spelling.
      if (length === 1 && TENS.has(words[at]) && ONES.has(words[at + 1] ?? "") && !spellings.has(`${words[at]} ${words[at + 1]}`)) {
        heard.push(`${words[at]} ${words[at + 1]}`);
        at += 2;
      } else if (length) {
        heard.push(whole);
        at += length;
      } else if (FILLER.has(words[at])) {
        at += 1;
      } else if (NUMBER_LIKE.test(words[at])) {
        heard.push(words[at]);
        at += 1;
      } else {
        return null;
      }
    }
  }
  return heard;
}
