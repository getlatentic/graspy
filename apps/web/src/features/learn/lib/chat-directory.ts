import { scopeKey, type ChatThread, type ThreadScope } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { scopeOf, targetOf, type ChatTarget } from "./chat-targets";
import type { CurrentTopic } from "./current-topic";

const RECENT_SHOWN = 5;

export interface DirectoryEntry {
  thread: ChatThread;
  target: ChatTarget;
}

interface ChatDirectoryEntries {
  topic: (CurrentTopic & { target: ChatTarget }) | null;
  recent: DirectoryEntry[];
  /** false while the general conversation is the open one. */
  anything: { thread: ChatThread | undefined } | false;
  offerTopics: boolean;
  offerEarlier: boolean;
}

export function chatDirectory(
  threads: ChatThread[],
  curriculum: CurriculumData | null,
  topic: CurrentTopic | null,
  open: ThreadScope | undefined,
): ChatDirectoryEntries {
  const openKey = open ? scopeKey(open) : null;
  return {
    topic: currentEntry(curriculum, topic, openKey),
    recent: recentEntries(threads, curriculum, openKey),
    anything: open?.kind !== "general" && {
      thread: threads.find(
        (thread) =>
          thread.scope.kind === "general" &&
          targetOf(thread.scope, curriculum) !== null,
      ),
    },
    offerTopics: (curriculum?.subjects.length ?? 0) > 0,
    offerEarlier:
      open?.kind !== "earlier" &&
      threads.some((thread) => thread.scope.kind === "earlier"),
  };
}

function currentEntry(
  curriculum: CurriculumData | null,
  topic: CurrentTopic | null,
  openKey: string | null,
): ChatDirectoryEntries["topic"] {
  if (!topic) return null;
  const target: ChatTarget = {
    kind: "topic",
    subjectSlug: topic.subject.slug,
    topicIndex: topic.topicIndex,
  };
  const scope = scopeOf(target, curriculum);
  return scope && scopeKey(scope) !== openKey ? { ...topic, target } : null;
}

function recentEntries(
  threads: ChatThread[],
  curriculum: CurriculumData | null,
  openKey: string | null,
): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];
  for (const thread of threads) {
    const { kind } = thread.scope;
    if (kind !== "topic" && kind !== "subject") continue;
    if (scopeKey(thread.scope) === openKey) continue;
    const target = targetOf(thread.scope, curriculum);
    if (target) entries.push({ thread, target });
  }
  return entries.slice(0, RECENT_SHOWN);
}
