import type { ChatThread } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { targetOf, type ChatTarget } from "./chat-targets";
import type { CurrentTopic } from "./current-topic";

export function latestChat(
  threads: ChatThread[],
  curriculum: CurriculumData | null,
  current: CurrentTopic | null,
): ChatTarget {
  for (const thread of threads) {
    if (thread.scope.kind === "earlier") continue;
    const target = targetOf(thread.scope, curriculum);
    if (target) return target;
  }
  return current
    ? {
        kind: "topic",
        subjectSlug: current.subject.slug,
        topicIndex: current.topicIndex,
      }
    : { kind: "general" };
}
