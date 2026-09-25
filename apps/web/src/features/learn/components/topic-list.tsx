import { ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import type { Standing } from "@/features/learn/lib/topic-marks";

const STANDING_STYLE: Record<Standing, string> = {
  learnt: "bg-warning-soft text-warning",
  ready: "bg-accent-soft text-accent-ink",
  "not-started": "bg-track text-muted",
};

interface TopicListProps {
  topics: string[];
  standings: Standing[];
  /** The topic a path leads to; -1 for a subject that is not a path. */
  goal: number;
  onOpen: (topicIndex: number) => void;
}

export function TopicList({ topics, standings, goal, onOpen }: TopicListProps) {
  return (
    <ol className="space-y-2">
      {topics.map((topic, index) => (
        <li key={topic}>
          <TopicRow
            topic={topic}
            number={index + 1}
            standing={standings[index] ?? "not-started"}
            isGoal={index === goal}
            onOpen={() => onOpen(index)}
          />
        </li>
      ))}
    </ol>
  );
}

interface TopicRowProps {
  topic: string;
  number: number;
  standing: Standing;
  isGoal: boolean;
  onOpen: () => void;
}

function TopicRow({ topic, number, standing, isGoal, onOpen }: TopicRowProps) {
  const { t } = useI18n();
  const label: Record<Standing, string> = {
    learnt: t("subject.learnt"),
    ready: t("subject.ready"),
    "not-started": t("subject.notStarted"),
  };
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 rounded-card border bg-surface px-4 py-4 text-start transition-colors hover:border-accent sm:px-5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        standing === "ready" ? "border-accent-line" : "border-line",
      )}
    >
      <span className="nums w-5 shrink-0 text-sm font-semibold text-muted">
        {number}
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block font-medium text-ink">
          {topic}
        </span>
        {isGoal && (
          <span className="mt-0.5 block text-xs font-semibold text-accent-ink">
            {t("subject.goal")}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
          STANDING_STYLE[standing],
        )}
      >
        {label[standing]}
      </span>
      <ChevronRight
        className="hidden size-4 shrink-0 text-muted sm:block rtl:rotate-180"
        aria-hidden="true"
      />
    </button>
  );
}
