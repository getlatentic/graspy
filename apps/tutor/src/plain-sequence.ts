/**
 * A list said in order, marked by code when the recording is plain.
 *
 * Counting, days of the week and the alphabet name their items, and each item lists every spelling a
 * recogniser may give it ("5" and "five", "twenty-five"). A transcript in which every word is one of
 * those spellings, or a filler, needs no model to read: code lays the words against the items. A word
 * that is neither, a garbled number or another language, means the plain reading cannot be trusted,
 * and the answer goes to the teacher model as before.
 */
import type { SequenceItem } from "./recite";

const FILLER = new Set(["and", "then", "um", "uh", "er", "erm", "so", "okay", "ok", "the", "is"]);
/**
 * A number that is not one of the items, "6" in a count to five, is plainly a wrong answer and is kept as
 * heard, where the marker ignores it. Four or more figures, or a leading zero, are as likely a recogniser
 * running numbers together ("1235", "05") and are not plain.
 */
const NUMBER_LIKE = /^(?:[1-9]\d{0,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)$/;
/** The longest spelling of an item, in words: "twenty five". */
const LONGEST_SPELLING = 3;

const flat = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The spellings of items the child said, in order, or null when a word in the transcript is not one.
 * A comma or full stop ends a phrase, so "twenty, five" is two items and "twenty five" is one.
 */
export function heardSequence(items: SequenceItem[], transcript: string | null): string[] | null {
  const spellings = new Set(items.flatMap((item) => item.spoken.map(flat)));
  const heard: string[] = [];
  for (const segment of (transcript ?? "").split(/[,;.!?]+/)) {
    const words = flat(segment).split(" ").filter(Boolean);
    for (let at = 0; at < words.length; ) {
      const length = [...Array(LONGEST_SPELLING).keys()]
        .map((k) => LONGEST_SPELLING - k)
        .find((n) => at + n <= words.length && spellings.has(words.slice(at, at + n).join(" ")));
      if (length) {
        heard.push(words.slice(at, at + length).join(" "));
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
