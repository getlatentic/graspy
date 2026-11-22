import latin from "./latin-ranges.json";

/** Compared at this length, so a huge name costs the same as a long one. */
const MAX_NAME = 80;
/** What is decomposed of a name: no character past it could reach the first MAX_NAME. */
const DECOMPOSED = MAX_NAME * 18;

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

/** Whether the code point is a Latin-script letter, by the checked-in table and not the engine's. */
function isLatin(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  let low = 0;
  let high = latin.ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [first, last] = latin.ranges[mid];
    if (cp < first) high = mid - 1;
    else if (cp > last) low = mid + 1;
    else return true;
  }
  return false;
}

/**
 * A subject's or course's name as it is compared: lower case, accents of Latin letters folded, and
 * no spaces or punctuation, so "Pre-calculus" is "Precalculus". The marks of other scripts are part
 * of their letters and stay. Nothing else makes two names one, so "Maths" and "Mathematics" stay two.
 * The same function as the server's normalise; name-key-corpus.json shares their cases.
 */
export function nameKey(name: string): string {
  let key = "";
  let latin = false;
  // Decomposed first, so "ＭＡＴＨＳ" and "𝐌𝐚𝐭𝐡𝐬" are lower-cased as the letters they are, and
  // cut after, by code points as the server does, not by UTF-16 units.
  const decomposed = Array.from(name)
    .slice(0, DECOMPOSED)
    .join("")
    .normalize("NFKD")
    .toLowerCase();
  for (const char of Array.from(decomposed).slice(0, MAX_NAME)) {
    if (/\p{M}/u.test(char)) {
      if (!latin) key += char;
    } else if (/[\p{L}\p{N}]/u.test(char)) {
      latin = isLatin(char);
      key += LETTERS[char] ?? char;
    } else {
      latin = false;
    }
  }
  return key;
}
