/**
 * Whether the words a recogniser wrote could be a number a child said: the number is in the words, or a word is close
 * to it in sound. A model that reads garbled words as a number is checked here, so a number it invents from noise is
 * refused and the child is asked again, while "tim" for ten, "nein" for nine and "free" for three are let through
 * without a table of them.
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

/** The number is written in the words, as digits or in English, alone or inside a longer answer. */
function written(tokens: string[], n: number): boolean {
  for (let from = 0; from < tokens.length; from += 1) {
    for (let to = from + 1; to <= Math.min(tokens.length, from + 4); to += 1) {
      if (spokenNumber(tokens.slice(from, to).join(" ")) === n) return true;
    }
  }
  return false;
}

export function soundsLike(heard: string, n: number): boolean {
  const tokens = heard.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token !== "");
  if (written(tokens, n)) return true;
  // The child said a number, and it is not this one.
  if (tokens.some((token) => spokenNumber(token) !== null)) return false;
  const target = skeleton(numberWords(n));
  if (target === "") return false;
  const allowed = target.length >= 2 ? 1 : 0;
  return tokens.some((token) => {
    const sound = skeleton(token);
    return sound !== "" && sound[0] === target[0] && distance(sound, target) <= allowed;
  });
}
