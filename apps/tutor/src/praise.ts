import { lineProblems } from "./guard";
import { numberWords } from "./lines";
import { RIGHT, RIGHT_LIST, RIGHT_NUMBER, RIGHT_WITH_YOU, NOT_QUITE, WRONG_NUMBER, withNumber } from "./phrasebook";
import { expectedAnswer, spokenNumber } from "./mark";
import { sameLine } from "./told";
import type { Ask } from "./turn";

function candidates(ask: Ask): string[] {
  if (ask.support === "modelled") return RIGHT_WITH_YOU;
  if (ask.expect.kind === "sequence") return RIGHT_LIST;
  if (ask.expect.kind !== "fact") return RIGHT;
  const number = spokenNumber(expectedAnswer(ask.expect.item));
  if (number === null) return RIGHT;
  const named = RIGHT_NUMBER.map((line) => withNumber(line, numberWords(number)));
  return named.every((line) => lineProblems(line).length === 0) ? named : RIGHT;
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

function pick(lines: string[], ask: Ask): string {
  const first = start(ask.prompt, lines.length);
  let best = lines[first];
  for (let step = 1; step < lines.length; step += 1) {
    const line = lines[(first + step) % lines.length];
    if (recency(line, ask.earlier) > recency(best, ask.earlier)) best = line;
  }
  return best;
}

/**
 * The line for a right answer, in English, or null where the steady line stands (another language, which has
 * no praise written). It is the line this child heard longest ago for this question, never the one just said.
 */
export function praiseLine(ask: Ask): string | null {
  return ask.language !== "en" ? null : pick(candidates(ask), ask);
}

/**
 * The line for a number answered wrongly: the right one, said for the child to say after the teacher. Null
 * where another language, or an answer that is not a number, leaves the steady line.
 */
export function correctionLine(ask: Ask): string | null {
  if (ask.language !== "en" || ask.expect.kind !== "fact") return null;
  if (ask.support === "probed") return pick(NOT_QUITE, ask);
  const number = spokenNumber(expectedAnswer(ask.expect.item));
  if (number === null) return null;
  const lines = WRONG_NUMBER.map((line) => withNumber(line, numberWords(number)));
  return lines.every((line) => lineProblems(line).length === 0) ? pick(lines, ask) : null;
}
