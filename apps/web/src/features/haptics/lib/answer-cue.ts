import type { Cue } from "./haptic-patterns";

/** The tools a view calls with a chosen option, in a lesson's check and in a chat's practice. */
const ANSWER_TOOLS = new Set(["answer_check", "answer_practice"]);

/** How an option the learner chose was graded: the cue for it, or none for a call that is not an answer. */
export function cueForAnswerCall(
  name: string,
  args: Record<string, unknown>,
): Extract<Cue, "correct" | "wrong"> | null {
  if (!ANSWER_TOOLS.has(name)) return null;
  const { chosenIndex, answerIndex } = args;
  if (typeof chosenIndex !== "number" || typeof answerIndex !== "number") {
    return null;
  }
  return chosenIndex === answerIndex ? "correct" : "wrong";
}

/** A spoken answer: a line she could not make out is not a wrong answer, so it gets no cue. */
export function cueForDecision(
  decision: "correct" | "try_again" | "not_understood",
): Extract<Cue, "correct" | "wrong"> | null {
  if (decision === "correct") return "correct";
  return decision === "try_again" ? "wrong" : null;
}
