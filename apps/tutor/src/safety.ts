/**
 * Words that mean a child needs the toilet or water, or is hurt, ill or frightened. These are not left to a model: asked
 * what to do with them it has said to finish the question first. Pain, bleeding and fear send the child to a grown-up;
 * the toilet or water lets them go.
 *
 * Two things the words are not. Water is a need only where it is asked for ("I need water"), since it is also the thing in
 * a word problem. And one word that is all the child said, and is the number asked for misheard ("pain" for ten, "poo"
 * for two), is the answer.
 */

import { soundsLike } from "./sounds-like";

export type Need = "needs_help" | "needs_grownup";

const TOILET =
  /\b(toilets?|bathrooms?|restrooms?|loo|latrine|pee|peed|peeing|piss|pissing|poo|poop|shit|wee|urinate|diarrhoea|diarrhea|thirsty|ease myself|wet myself|(short|long) call)\b/i;
const WATER_ASKED_FOR = /\b(need|want|wants|drink|fetch|get|give me)\s+(some\s+|a\s+|the\s+|my\s+)?water\b/i;
const HURT =
  /\b(hurt|hurts|hurting|pain|paining|painful|ache|aching|aches|fever|vomit|vomiting|dizzy|sick|headache|stomach|tummy|bleeding|bleed|blood|faint|fainting|scared|afraid|frightened|snake|(am|is|im|feel|feeling|been) ill|(hit|hits|hitting|beat|beating|beats|slap|slapped|push|pushed|pushing|kick|kicked|kicking|bit|bite|bites) me|breathe|breathing|not feeling well|no well)\b/i;
const FILLER = new Set(["it", "is", "its", "i", "think", "the", "a", "said", "say", "was", "um", "uh", "er", "answer"]);
const NOT_FEAR = /\b(i am|i['’]?m) afraid (it|that|its|this)\b/gi;

function words(heard: string): string[] {
  return heard.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((word) => word !== "");
}

/** The one word that is all a child said, filler aside, or null where they said more. */
function loneWord(heard: string): string | null {
  const rest = words(heard).filter((word) => !FILLER.has(word));
  return rest.length === 1 ? rest[0] : null;
}

/** Whether all the child said is one word that is the answer asked for, misheard: "pain" for ten, "poo" for two. */
export function isOnlyTheAnswer(heard: string, answer: number | null): boolean {
  const word = loneWord(heard);
  return word !== null && answer !== null && soundsLike(word, answer);
}

/** What a child's words ask for, or null where they ask for nothing of the kind. `answer` is the number the question asks for. */
export function needFor(heard: string, answer: number | null = null): Need | null {
  if (isOnlyTheAnswer(heard, answer)) return null;
  const said = heard.replace(NOT_FEAR, " ");
  if (HURT.test(said)) return "needs_grownup";
  return TOILET.test(said) || WATER_ASKED_FOR.test(said) || loneWord(said) === "water" ? "needs_help" : null;
}
