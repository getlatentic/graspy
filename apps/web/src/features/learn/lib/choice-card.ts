import type { ChatMessage } from "@/lib/chat-db";

/** A question to answer by a tap, which only the latest message may still be answered. */
export const CHOICE_UI = "ui://graspy/choice";
/** The form that asks the learner's country and class, answered once like a choice. */
export const DETAILS_UI = "ui://graspy/details";

/** Whether a card asks the learner something to answer: a choice or the form. */
export const asksLearner = (resourceUri: string | undefined): boolean =>
  resourceUri === CHOICE_UI || resourceUri === DETAILS_UI;

/** Whether the conversation waits on a question the learner has not answered: one decision at a
 * time, so nothing else asks them to decide meanwhile. */
export function awaitsChoice(last: ChatMessage | undefined): boolean {
  return last?.sender === "ai" && asksLearner(last.metadata?.card?.resourceUri);
}
