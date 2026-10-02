/**
 * Words that mean a child needs the toilet or water, or is hurt, ill or frightened. These are not left to a model: asked
 * what to do with them it has said to finish the question first. Pain, bleeding and fear send the child to a grown-up;
 * the toilet or water lets them go.
 *
 * Two things the words are not. Water is a need only where it is asked for ("I need water"), since it is also the thing in
 * a word problem. And a word that is nothing but a mishearing of the number asked for ("pain" for ten, "poo" for two)
 * for the number asked is an answer when it is all the child said.
 */

import { soundsLike } from "./sounds-like";

export type Need = "needs_help" | "needs_grownup";

const TOILET = /\b(toilet|bathroom|latrine|pee|peeing|poo|poop|wee|urinate|thirsty|ease myself|(short|long) call)\b/i;
const WATER_ASKED_FOR = /\bwater\b/i;
const ASKING = /\b(need|want|wants|drink|please|give|fetch|get|thirsty)\b/i;
const HURT =
  /\b(hurt|hurts|hurting|pain|paining|painful|ache|aching|aches|fever|vomit|vomiting|dizzy|sick|headache|stomach|tummy|bleeding|bleed|scared|afraid|frightened|(am|is|im|feel|feeling|been) ill|(hit|beat|beating|beats) me)\b/i;
const FILLER = new Set(["it", "is", "its", "i", "think", "the", "a", "said", "say", "was", "um", "uh", "er", "answer"]);

function words(heard: string): string[] {
  return heard.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((word) => word !== "");
}

/** Whether what was said, filler aside, is only the answer asked for misheard as one of these words. */
function onlyTheAnswerMisheard(heard: string, matched: RegExp, answer: number | null): boolean {
  const rest = words(heard).filter((word) => !FILLER.has(word));
  return answer !== null && rest.length > 0 && rest.every((word) => matched.test(word)) && soundsLike(rest.join(" "), answer);
}

/** What a child's words ask for, or null where they ask for nothing of the kind. `answer` is the number the question asks for. */
export function needFor(heard: string, answer: number | null = null): Need | null {
  if (HURT.test(heard)) return onlyTheAnswerMisheard(heard, HURT, answer) ? null : "needs_grownup";
  const toilet = TOILET.test(heard) || (WATER_ASKED_FOR.test(heard) && ASKING.test(heard));
  if (!toilet) return null;
  return onlyTheAnswerMisheard(heard, new RegExp(`${TOILET.source}|water`, "i"), answer) ? null : "needs_help";
}
