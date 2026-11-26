import type { ChatMessage } from "@/lib/chat-db";

/** A question to answer by a tap, which only the latest message may still be answered. */
export const CHOICE_UI = "ui://graspy/choice";

/** Whether the conversation waits on a question the learner has not answered: one decision at a
 * time, so nothing else asks them to decide meanwhile. */
export function awaitsChoice(last: ChatMessage | undefined): boolean {
  return (
    last?.sender === "ai" && last.metadata?.card?.resourceUri === CHOICE_UI
  );
}
