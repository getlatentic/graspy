import type { ChatMessage } from "@/lib/chat-db";

/** A question and its answers; the unit a pinned question reserves room for. */
export interface Turn {
  id: string;
  messages: ChatMessage[];
}

export function groupTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const current = turns[turns.length - 1];
    if (message.sender === "user" || !current) {
      turns.push({ id: message.id, messages: [message] });
    } else {
      current.messages.push(message);
    }
  }
  return turns;
}
