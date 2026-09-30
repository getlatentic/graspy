import { lineProblems } from "./guard";
import { numberWords } from "./lines";
import { expectedAnswer, spokenNumber } from "./mark";
import { sameLine } from "./told";
import type { Ask } from "./turn";

/** A right answer is praised for what it was, in a few ways, so a child who gets one after another hears more than one line. */
const FOR_A_NUMBER = [
  (said: string) => `Yes, ${said}.`,
  (said: string) => `That is right: ${said}.`,
  (said: string) => `Well done. ${said[0].toUpperCase()}${said.slice(1)}.`,
  (said: string) => `You know it: ${said}.`,
];
const FOR_A_LIST = [
  "Well done. You said them all.",
  "That is right. Every one, in order.",
  "Yes! All of them, in the right order.",
  "You did it. All in order.",
];
const FOR_ANYTHING = ["That is right.", "Yes, that is it.", "Well done."];

function candidates(ask: Ask): string[] {
  if (ask.expect.kind === "sequence") return FOR_A_LIST;
  if (ask.expect.kind !== "fact") return FOR_ANYTHING;
  const number = spokenNumber(expectedAnswer(ask.expect.item));
  if (number === null) return FOR_ANYTHING;
  const named = FOR_A_NUMBER.map((say) => say(numberWords(number)));
  return named.every((line) => lineProblems(line).length === 0) ? named : FOR_ANYTHING;
}

/** How long ago the child heard the line for this question: 0 is the latest, and a line never heard is furthest back. */
function recency(line: string, earlier: Ask["earlier"]): number {
  const at = earlier?.findIndex((told) => sameLine(told.line, line)) ?? -1;
  return at === -1 ? Number.POSITIVE_INFINITY : at;
}

/** A stable pick from a question, so the same question is praised the same way until it has been praised that way already. */
function start(text: string, among: number): number {
  let hash = 0;
  for (const letter of text) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return hash % among;
}

/**
 * The line for a right answer, in English, or null where the steady line stands (another language, which has
 * no praise written). It is the line this child heard longest ago for this question, never the one just said.
 */
export function praiseLine(ask: Ask): string | null {
  if (ask.language !== "en") return null;
  const lines = candidates(ask);
  const first = start(ask.prompt, lines.length);
  let best = lines[first];
  for (let step = 1; step < lines.length; step += 1) {
    const line = lines[(first + step) % lines.length];
    if (recency(line, ask.earlier) > recency(best, ask.earlier)) best = line;
  }
  return best;
}
