/** Compared at this length, so a huge name costs the same as a long one. */
const MAX_NAME = 80;

/** Letters with no decomposition into a base letter and marks. */
const LETTERS: Record<string, string> = {
  ø: "o",
  ł: "l",
  ı: "i",
  đ: "d",
  ð: "d",
  þ: "th",
  æ: "ae",
  œ: "oe",
  ß: "ss",
};

/**
 * A subject's or course's name as it is compared: lower case, accents of Latin letters folded, and
 * no spaces or punctuation, so "Pre-calculus" is "Precalculus". The marks of other scripts are part
 * of their letters and stay. Nothing else makes two names one, so "Maths" and "Mathematics" stay two.
 * The same function as the server's normalise; name-key-corpus.json shares their cases.
 */
export function nameKey(name: string): string {
  let key = "";
  let latin = false;
  for (const char of name.slice(0, MAX_NAME).toLowerCase().normalize("NFKD")) {
    if (/\p{M}/u.test(char)) {
      if (!latin) key += char;
    } else if (/[\p{L}\p{N}]/u.test(char)) {
      latin = /\p{Script=Latin}/u.test(char);
      key += LETTERS[char] ?? char;
    } else {
      latin = false;
    }
  }
  return key;
}
