/**
 * Whether the words a recogniser wrote could be a number a child said: the number is in the words, or a word is close
 * to it in sound. A model that reads garbled words as a number is checked here, so a number it invents from noise is
 * refused while "tim" for ten, "nein" for nine and "free" for three are let through without a table of them.
 */

import { numberWords } from "./lines";
import { spokenNumber } from "./mark";

/**
 * Letters that sound alike are one class, and what is left after the vowels is a word's skeleton. The stops and the
 * lips run together ("then" for ten, "free" for three), as do the nasals; silent letters go.
 */
const CLASS: Record<string, string> = {
  gh: "", th: "t", ph: "t", ck: "k", qu: "k", ch: "c", sh: "c", c: "s", z: "s", d: "t", f: "t", v: "t", b: "t", p: "t",
  g: "k", q: "k", m: "n", l: "n", r: "n", j: "c", x: "ks", w: "", y: "", h: "",
};

function skeleton(word: string): string {
  const letters = word.toLowerCase().replace(/[^a-z]/g, "");
  let out = "";
  for (let at = 0; at < letters.length; ) {
    const pair = letters.slice(at, at + 2);
    const sound = pair in CLASS ? CLASS[pair] : (CLASS[letters[at]] ?? letters[at]);
    at += pair in CLASS ? 2 : 1;
    out += sound;
  }
  return out.replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** A word is a word with its apostrophes ("don't" is one), not the pieces either side of them. */
function wordsOf(heard: string): string[] {
  return heard.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((token) => token !== "");
}

/** The numbers written in the words, in order, as digits or English: the longest run of words that is a number, each time. */
export function writtenNumbers(heard: string): number[] {
  const tokens = wordsOf(heard);
  const found: number[] = [];
  for (let from = 0; from < tokens.length; ) {
    let taken = 0;
    for (let to = Math.min(tokens.length, from + 4); to > from; to -= 1) {
      const value = spokenNumber(tokens.slice(from, to).join(" "));
      if (value !== null) { found.push(value); taken = to - from; break; }
    }
    from += Math.max(1, taken);
  }
  return found;
}

/**
 * Whether a word is close to a number said aloud: about as long, with the same first and last sounds, and at most one
 * sound between that differs.
 */
function closeTo(word: string, spoken: string, target: string): boolean {
  const sound = skeleton(word);
  if (sound === "" || target === "") return false;
  if (Math.abs(word.length - spoken.replace(/[^a-z]/g, "").length) > 2) return false;
  if (sound[0] !== target[0] || sound[sound.length - 1] !== target[target.length - 1]) return false;
  return distance(sound, target) <= (target.length >= 3 ? 1 : 0);
}

/**
 * Whether the number a model reports is one the words could be. Where the words hold a number it is the last they
 * hold ("nine, no, eight" is eight, and "five and five is ten" is ten); where they hold none, a word must be close in
 * sound to it.
 */
export function soundsLike(heard: string, n: number): boolean {
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return false;
  const written = writtenNumbers(heard);
  if (written.length > 0) return written[written.length - 1] === n;
  const spoken = numberWords(n);
  const target = skeleton(spoken);
  return wordsOf(heard).some((word) => closeTo(word, spoken, target));
}

/** Whether the words hold a number, or are close in sound to one of the numbers a child is asked for. */
export function couldBeANumber(heard: string): boolean {
  if (writtenNumbers(heard).length > 0) return true;
  const targets = Array.from({ length: 101 }, (_, n) => [numberWords(n), skeleton(numberWords(n))] as const);
  return wordsOf(heard).some((word) => targets.some(([spoken, target]) => closeTo(word, spoken, target)));
}

/** Whether the words are nothing but a number ("ten", "twenty two", "10"): an answer, with nothing to route. */
export function isBareNumber(heard: string): boolean {
  const tokens = wordsOf(heard);
  return tokens.length > 0 && tokens.every((token) => token === "and" || spokenNumber(token) !== null);
}
