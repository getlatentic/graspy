import type { ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { ChatThread, ThreadScope } from "@/lib/chat-db";
import { useI18n } from "@/lib/i18n-context";
import { useUserProfile } from "@/lib/use-user-profile";
import { levelLabel } from "@/lib/learner-level";
import { currentTopic } from "@/features/learn/lib/current-topic";
import {
  chatDirectory,
  type DirectoryEntry,
} from "@/features/learn/lib/chat-directory";
import type { ChatTarget } from "@/features/learn/lib/chat-targets";
import { ScopeIcon, ThreadRow } from "@/features/learn/components/thread-row";
import { TopicChooser } from "@/features/learn/components/topic-chooser";
import { UnreadDot } from "@/features/learn/components/unread-dot";
import { Button } from "@/components/ui/button";
import { useChat, usePlan } from "../learner-context";

interface ChatDirectoryProps {
  /** Left out of the choices. */
  current: ThreadScope;
  onPick: (target: ChatTarget) => void;
}

export function ChatDirectory({ current, onPick }: ChatDirectoryProps) {
  const { t } = useI18n();
  const { curriculum, nextSubject } = usePlan();
  const { threads } = useChat();
  const { topic, recent, anything, offerTopics, offerEarlier } = chatDirectory(
    threads,
    curriculum,
    currentTopic(curriculum, nextSubject),
    current,
  );

  return (
    <div className="flex flex-col gap-6">
      {topic && (
        <Group title={t("ask.currentTopic")}>
          <CurrentTopicCard
            topic={topic.topic}
            subject={topic.subject.name}
            onOpen={() => onPick(topic.target)}
          />
        </Group>
      )}

      {recent.length > 0 && (
        <Group title={t("ask.recent")}>
          <RecentList entries={recent} onPick={onPick} />
        </Group>
      )}

      {anything && (
        <Group title={t("ask.anythingTitle")}>
          <AnythingRow
            thread={anything.thread}
            onOpen={() => onPick({ kind: "general" })}
          />
        </Group>
      )}

      {offerTopics && (
        <Group title={t("ask.chooseTopic")}>
          <TopicChooser curriculum={curriculum} onPick={onPick} />
        </Group>
      )}

      {offerEarlier && (
        <EarlierLink onOpen={() => onPick({ kind: "earlier" })} />
      )}
    </div>
  );
}

interface CurrentTopicCardProps {
  topic: string;
  subject: string;
  onOpen: () => void;
}

function RecentList({
  entries,
  onPick,
}: {
  entries: DirectoryEntry[];
  onPick: (target: ChatTarget) => void;
}) {
  const { curriculum } = usePlan();
  const { unread } = useChat();
  return (
    <div className="divide-y divide-line">
      {entries.map(({ thread, target }) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          curriculum={curriculum}
          unread={unread.has(thread.id)}
          onOpen={() => onPick(target)}
        />
      ))}
    </div>
  );
}

function CurrentTopicCard({ topic, subject, onOpen }: CurrentTopicCardProps) {
  const { t } = useI18n();
  const profile = useUserProfile();
  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ScopeIcon kind="topic" subject={subject} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-ink">{topic}</p>
          <p className="truncate text-xs text-muted">
            {profile ? `${subject} · ${levelLabel(profile, t)}` : subject}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={onOpen}
        className="shrink-0 gap-1 rounded-full px-4 py-2"
      >
        {t("ask.open")}
        <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
      </Button>
    </div>
  );
}

interface AnythingRowProps {
  thread: ChatThread | undefined;
  onOpen: () => void;
}

function AnythingRow({ thread, onOpen }: AnythingRowProps) {
  const { t } = useI18n();
  const { unread } = useChat();
  const hasUnread = thread !== undefined && unread.has(thread.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <ScopeIcon kind="general" subject={null} className="size-10" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">
          {t("ask.anything")}
        </span>
        <span className="block truncate text-xs text-muted" dir="auto">
          {thread?.preview ?? t("ask.anythingDetail")}
        </span>
      </span>
      {hasUnread && <UnreadDot className="size-2 shrink-0" />}
      <ChevronRight
        className="size-4 shrink-0 text-muted rtl:rotate-180"
        aria-hidden="true"
      />
    </button>
  );
}

function EarlierLink({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="self-start text-sm font-medium text-accent-ink hover:underline"
    >
      {t("ask.earlierLink")}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-sans text-base font-semibold text-ink">
        {title}
      </h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}
