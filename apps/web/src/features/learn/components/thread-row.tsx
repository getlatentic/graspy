import { ChevronRight, History, MessageCircle } from "lucide-react";
import type { ChatThread, ThreadScope } from "@/lib/chat-db";
import type { CurriculumData } from "@/lib/curriculum-record";
import { useI18n } from "@/lib/i18n-context";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";
import { SubjectIcon } from "@/features/learn/components/subject-icon";
import { UnreadDot } from "@/features/learn/components/unread-dot";
import { describeScope } from "@/features/learn/lib/describe-scope";
import { subjectTintClasses } from "@/features/learn/lib/subject-icons";

export function ScopeIcon({
  kind,
  subject,
  className,
}: {
  kind: ThreadScope["kind"];
  subject: string | null;
  className?: string;
}) {
  const Icon =
    kind === "earlier" ? History : kind === "general" ? MessageCircle : null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        subject ? subjectTintClasses(subject) : "bg-accent-soft text-accent",
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-5" aria-hidden="true" />
      ) : (
        <SubjectIcon name={subject ?? ""} className="size-5" />
      )}
    </span>
  );
}

interface ThreadRowProps {
  thread: ChatThread;
  curriculum: CurriculumData | null;
  unread: boolean;
  onOpen: () => void;
}

export function ThreadRow({
  thread,
  curriculum,
  unread,
  onOpen,
}: ThreadRowProps) {
  const { t, locale } = useI18n();
  const { title, subject } = describeScope(thread.scope, curriculum, t);
  const detail = [subject, thread.preview].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <ScopeIcon
        kind={thread.scope.kind}
        subject={subject}
        className="size-10"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {title}
        </span>
        {detail && (
          <span className="block truncate text-xs text-muted" dir="auto">
            {detail}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
        {unread && <UnreadDot className="size-2" />}
        {timeAgo(thread.updatedAt, locale)}
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
      </span>
    </button>
  );
}
