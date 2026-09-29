/** Words as a speech recogniser and a child's answer key would compare them. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = ["", "", "twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

/** The number that results when a number word follows the one read so far, or null when it starts a new number. */
function extend(current: number | null, word: string): number | null {
  const small = ONES.indexOf(word);
  const tens = TENS.indexOf(word);
  if (current === null) {
    if (small >= 0) return small;
    return tens >= 2 ? tens * 10 : null;
  }
  const afterHundred = current >= 100 && current % 100 === 0;
  const afterTens = current % 100 >= 20 && current % 10 === 0;
  if (small >= 1 && small <= 9 && (afterHundred || afterTens)) return current + small;
  if (small >= 10 && afterHundred) return current + small;
  if (tens >= 2 && afterHundred) return current + tens * 10;
  if (word === "hundred" && current >= 1 && current <= 9) return current * 100;
  return null;
}

/** Spoken numbers as digits, as a recogniser writes them: "fifty six" and "56" compare equal. */
export function spokenNumbersAsDigits(words: string[]): string[] {
  const out: string[] = [];
  let current: number | null = null;
  const flush = () => {
    if (current !== null) out.push(String(current));
    current = null;
  };
  for (const word of words.flatMap((w) => w.split("-"))) {
    if (word === "and" && current !== null && current >= 100) continue;
    const carried = extend(current, word);
    if (carried !== null && current !== null) {
      current = carried;
      continue;
    }
    flush();
    current = extend(null, word);
    if (current === null) out.push(word);
  }
  flush();
  return out;
}

/** Share of the intended words the recogniser also produced, in order: 1 is a faithful hearing. */
export function hearingFidelity(intended: string, heard: string): number {
  const want = spokenNumbersAsDigits(wordsOf(intended));
  if (want.length === 0) return 1;
  const got = spokenNumbersAsDigits(wordsOf(heard));
  const table = Array.from({ length: want.length + 1 }, () =>
    new Array<number>(got.length + 1).fill(0),
  );
  for (let i = 1; i <= want.length; i++) {
    for (let j = 1; j <= got.length; j++) {
      table[i][j] =
        want[i - 1] === got[j - 1]
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[want.length][got.length] / want.length;
}
