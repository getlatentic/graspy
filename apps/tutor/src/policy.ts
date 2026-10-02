/**
 * What the tutor does with an observation. The model observes; this decides, in a fixed order, with a threshold for each
 * kind of judgment since the cost of a miss is not the same: a child who is hurt is taken seriously at a low score, a
 * number is marked only at a high one.
 *
 *   safety > a need > a usable answer > not knowing > asking again > a question or something else > garbled
 *
 * What the model could not know is applied here: the answer asked for, which the words may sound like, and what the question holds.
 */

import type { Observation } from "./observation";
import type { Route } from "./router";
import { isOnlyTheAnswer } from "./safety";
import { soundsLike, writtenNumbers } from "./sounds-like";

export const THRESHOLD: Record<"safety" | "need" | "answer" | "dont_know" | "repeat_request" | "talk" | "unintelligible", number> = {
  safety: 0.4,
  need: 0.5,
  answer: 0.6,
  dont_know: 0.5,
  repeat_request: 0.5,
  talk: 0.5,
  unintelligible: 0.5,
};

const top = (scores: Record<string, number>) => Math.max(0, ...Object.values(scores));

export interface Heard {
  /** What the recogniser wrote. */
  words: string;
  /** The number the question asks for. */
  expected: number | null;
  /** What the child was asked. */
  question?: string;
}

/**
 * The number the child gave, or null: the one the model reported where the words could be it, else the one the question asks
 * for where it is written in the words, which the model was not told. A number the question itself holds, said by a child
 * who is asking something, is the child's echo of it. A sound-alike is never credited with the answer asked for: "tree" is
 * three, and the model's number is the one checked against it.
 */
function givenNumber({ answer, communication: said }: Observation, heard: Heard, at: typeof THRESHOLD): number | null {
  const asking = said.child_question >= at.talk || said.repeat_request >= at.repeat_request;
  const echoed = (value: number) => asking && value !== heard.expected && writtenNumbers(heard.question ?? "").includes(value);
  if (answer !== null && answer.confidence >= at.answer && soundsLike(heard.words, answer.value) && !echoed(answer.value)) return answer.value;
  const competing = answer !== null && answer.value !== heard.expected;
  return heard.expected !== null && !competing && writtenNumbers(heard.words).at(-1) === heard.expected ? heard.expected : null;
}

/** The action for an observation, or null where it settles nothing and the usual marking goes on. */
export function decide(observation: Observation, heard: Heard, at: typeof THRESHOLD = THRESHOLD): Route | null {
  const { communication: said, physicalNeed, safety } = observation;
  // One word that is the number asked for, misheard as a word for a need, is the answer whatever the model took it for.
  if (heard.expected !== null && isOnlyTheAnswer(heard.words, heard.expected)) return { action: "mark_answer", said: heard.expected };
  const given = givenNumber(observation, heard, at);
  // Water in a word problem about water is its subject, not a request, where the child gave a number.
  const water = given !== null && /\bwater\b/i.test(heard.question ?? "") ? 0 : physicalNeed.water;
  if (top(safety) >= at.safety) return { action: "needs_grownup" };
  if (Math.max(physicalNeed.toilet, water) >= at.need) return { action: "needs_help" };
  if (given !== null) return { action: "mark_answer", said: given };
  if (said.dont_know >= at.dont_know) return { action: "not_know" };
  if (said.repeat_request >= at.repeat_request) return { action: "repeat_question" };
  if (Math.max(said.child_question, said.off_topic) >= at.talk) return { action: "answer_child", ...(observation.reply === undefined ? {} : { reply: observation.reply }) };
  if (said.unintelligible >= at.unintelligible) return { action: "ask_again" };
  return null;
}
