import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  topicsOf,
  type CurriculumData,
  type CurriculumSubject,
} from "@/lib/curriculum-record";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import { ScopeIcon } from "@/features/learn/components/thread-row";
import type { ChatTarget } from "@/features/learn/lib/chat-targets";

interface TopicChooserProps {
  curriculum: CurriculumData | null;
  onPick: (target: ChatTarget) => void;
}

const OPTION =
  "w-full py-2.5 ps-16 pe-4 text-start text-sm transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/** A subject without topics opens at once; otherwise it expands to its topics. */
export function TopicChooser({ curriculum, onPick }: TopicChooserProps) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-line">
      {(curriculum?.subjects ?? []).map((subject) => (
        <SubjectOption
          key={subject.slug}
          subject={subject}
          topics={topicsOf(curriculum, subject.slug)}
          expanded={open === subject.slug}
          onToggle={() => setOpen(open === subject.slug ? null : subject.slug)}
          onPick={onPick}
        />
      ))}
    </ul>
  );
}

interface SubjectOptionProps {
  subject: CurriculumSubject;
  topics: string[];
  expanded: boolean;
  onToggle: () => void;
  onPick: (target: ChatTarget) => void;
}

function SubjectOption({
  subject,
  topics,
  expanded,
  onToggle,
  onPick,
}: SubjectOptionProps) {
  const wholeSubject: ChatTarget = {
    kind: "subject",
    subjectSlug: subject.slug,
  };
  return (
    <li>
      <button
        type="button"
        onClick={() =>
          topics.length === 0 ? onPick(wholeSubject) : onToggle()
        }
        aria-expanded={topics.length > 0 ? expanded : undefined}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <ScopeIcon kind="subject" subject={subject.name} className="size-9" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {subject.name}
        </span>
        {topics.length > 0 && (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        )}
      </button>
      {expanded && (
        <TopicOptions subject={subject} topics={topics} onPick={onPick} />
      )}
    </li>
  );
}

function TopicOptions({
  subject,
  topics,
  onPick,
}: {
  subject: CurriculumSubject;
  topics: string[];
  onPick: (target: ChatTarget) => void;
}) {
  const { t } = useI18n();
  return (
    <ul className="pb-2">
      <li>
        <button
          type="button"
          onClick={() => onPick({ kind: "subject", subjectSlug: subject.slug })}
          className={cn(OPTION, "font-semibold text-accent-ink")}
        >
          {t("ask.allOf", { subject: subject.name })}
        </button>
      </li>
      {topics.map((topic, topicIndex) => (
        <li key={topic}>
          <button
            type="button"
            onClick={() =>
              onPick({ kind: "topic", subjectSlug: subject.slug, topicIndex })
            }
            className={cn(OPTION, "text-ink")}
          >
            {topic}
          </button>
        </li>
      ))}
    </ul>
  );
}
