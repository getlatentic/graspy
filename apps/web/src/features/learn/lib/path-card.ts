import type { ChatMessage } from "@/lib/chat-db";

/** The card that proposes a path, whose topics the learner chooses among. */
export const PATH_UI = "ui://graspy/path";

/** How the card's answer begins, and so how the learner's reply to it reads (the server's
 * agent/path_answer.py, and the card's own words). */
const ANSWER_HEAD = "Add to my plan:";

/** What the learner's answer to a path card says, as a line to show in place of the list of every
 * topic it names: the courses, and how many topics were kept. Null for any other message. */
export function pathAnswerSummary(
  content: string,
): { subjects: string; count: number } | null {
  if (!content.startsWith(ANSWER_HEAD)) return null;
  const lines = content.split("\n");
  const subjects = lines
    .filter((line) => line.startsWith("Course: "))
    .map((line) => line.slice("Course: ".length));
  if (subjects.length === 0) return null;
  const count = lines.filter((line) => line.startsWith("- ")).length;
  return { subjects: subjects.join(", "), count };
}

const holdsPath = (message: ChatMessage) =>
  message.sender === "ai" && message.metadata?.card?.resourceUri === PATH_UI;

/** The messages whose path card has been replaced by a newer one, so that two are never live: a
 * card the learner answered keeps its place, showing what they chose, but one they asked to have
 * changed gives way to the card that came of it. */
export function replacedPathCards(
  messages: readonly ChatMessage[],
): ReadonlySet<string> {
  const replaced = new Set<string>();
  let laterCard = false;
  // The learner's message nearest after the message in hand.
  let reply: ChatMessage | undefined;
  for (let at = messages.length - 1; at >= 0; at--) {
    const message = messages[at];
    if (message.sender === "user") reply = message;
    if (!holdsPath(message)) continue;
    if (laterCard && !reply?.content.startsWith(ANSWER_HEAD)) {
      replaced.add(message.id);
    }
    laterCard = true;
  }
  return replaced;
}
