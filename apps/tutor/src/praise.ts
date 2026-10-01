import { lineProblems } from "./guard";
import { numberWords } from "./lines";
import { RIGHT, RIGHT_LIST, RIGHT_NUMBER, RIGHT_WITH_YOU, LIST_STOPPED, NOT_HEARD, NOT_QUITE, TOLD_NUMBER, WRONG_NUMBER, withNumber } from "./phrasebook";
import { expectedAnswer, spokenNumber } from "./mark";
import { sameLine } from "./told";
import type { SequenceItem, SequenceResult } from "./recite";
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

/** The line for a recording that could not be read as an answer, or null where the steady line stands. */
export function notHeardLine(ask: Ask): string | null {
  return ask.language !== "en" ? null : pick(NOT_HEARD, ask);
}

/**
 * The line for a number answered wrongly, least help first: the plan's cue, then its hint, and only then the
 * right number said for the child to say after the teacher. Which rung it is comes from how many times this
 * child has already been answered wrongly on this question. Null where another language, or an answer that is
 * not a number, leaves the steady line. A child who said they did not know has given nothing to be almost
 * right, so the number is told without "almost" or "not quite".
 */
export function correctionLine(ask: Ask, tried = true): string | null {
  if (ask.language !== "en" || ask.expect.kind !== "fact") return null;
  if (ask.support === "probed" && tried) return pick(NOT_QUITE, ask);
  const wrongBefore = ask.earlier?.filter((told) => told.verdict === "wrong").length ?? 0;
  const hint = ask.expect.hints?.[wrongBefore];
  if (hint !== undefined && lineProblems(hint).length === 0) return hint;
  const number = spokenNumber(expectedAnswer(ask.expect.item));
  if (number === null) return null;
  const lines = (tried ? WRONG_NUMBER : TOLD_NUMBER).map((line) => withNumber(line, numberWords(number)));
  return lines.every((line) => lineProblems(line).length === 0) ? pick(lines, ask) : null;
}

/** An item as it is said aloud: its first spelling in letters, or the words for its number. */
function spokenWords(item: SequenceItem): string {
  const spelled = item.spoken.find((word) => /[a-z]/i.test(word));
  if (spelled !== undefined) return spelled;
  const number = spokenNumber(item.id);
  return number === null ? item.id : numberWords(number);
}

/**
 * The line for a list that stopped part way: how far the child got, said back to them, which is what the
 * teacher would say. Null where the steady line stands: another language, or nothing right at the start of what
 * was asked.
 */
export function listStoppedLine(ask: Ask, result: SequenceResult): string | null {
  if (ask.language !== "en" || ask.expect.kind !== "sequence") return null;
  const broken = new Set([...result.missing, ...result.out_of_order]);
  const at = ask.expect.items.findIndex((item) => broken.has(item.id));
  if (at <= 0) return null;
  const last = spokenWords(ask.expect.items[at - 1]);
  const lines = LIST_STOPPED.map((line) => line.replaceAll("{last}", last));
  return lines.every((line) => lineProblems(line).length === 0) ? pick(lines, ask) : null;
}
