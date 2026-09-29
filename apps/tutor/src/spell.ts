/**
 * A child's line writes every number as a word, and a model writes the line, so a line with digits in
 * it is put right by a model too: a small, fast one asked to change the digits and nothing else, in the
 * language of the line. Code does not spell numbers for a line, because what "3:30", "50%" or "1st"
 * come to in words, and what any of it comes to in Yoruba, is a matter of language.
 *
 * Code does check the result. A model asked to spell "5" must not hand a child "fifty-five", nor change a
 * word beside it: the reply must read, word for word, as the line with each number written out. A line
 * with a number that does not stand alone ("3:30", "₦500", "1st") has no such reading to check against, so
 * it is not trusted to the model.
 *
 * English only, until it is proven there. Tried on Yoruba, the model wrote numbers without their tone
 * marks and twice ran out of tokens before answering; Pidgin has not been tried.
 */
import { expectedSpelling, standaloneNumbers } from "./lines";
import { complete } from "./speller-host";

/** A spelled line is about as long as the line was; one far longer has been rewritten, not spelled. */
const MOST_GROWTH = 2.5;

function brief(text: string): string {
  return [
    "Rewrite this line, which is said aloud to a child in English, so that every number",
    "written in digits is written in words instead. Change nothing else: not a word, not the punctuation.",
    "Reply with the rewritten line only.",
    `The line: "${text.replace(/"/g, "'")}"`,
  ].join("\n");
}

/** The words of a line, without case, punctuation, hyphens or "and" (which "one hundred and five" adds). */
const wordsOf = (text: string) =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "" && word !== "and");

/** Whether the reply reads exactly as the line does with every number written out. */
function keepsTheLine(line: string, spelled: string): boolean {
  const want = wordsOf(expectedSpelling(line));
  const got = wordsOf(spelled);
  return want.length === got.length && want.every((word, at) => word === got[at]);
}

function acceptable(line: string, spelled: string | null): spelled is string {
  if (!spelled || /\d/.test(spelled) || spelled.length > line.length * MOST_GROWTH) return false;
  return keepsTheLine(line, spelled);
}

/** Every run of digits in the line is a number standing alone, so the result can be checked. */
function checkable(line: string): boolean {
  return standaloneNumbers(line).length === (line.match(/\d+/g) ?? []).length;
}

/** The line with its digits written as words, or the line as it was when they cannot be trusted. */
export async function spellNumbers(env: Env, line: string, language: string): Promise<string> {
  if (language !== "en" || !/\d/.test(line) || !checkable(line)) return line;
  try {
    const said = await complete(env, brief(line));
    const spelled = typeof said === "string" ? said.trim().replace(/^"(.*)"$/s, "$1") : null;
    return acceptable(line, spelled) ? spelled : line;
  } catch (error) {
    console.log(JSON.stringify({ part: "spell-failed", why: String(error) }));
    return line;
  }
}
