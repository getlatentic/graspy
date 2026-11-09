import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { OwedTopic } from "@/features/learn/lib/topic-marks";

interface ReviewListProps {
  topics: readonly OwedTopic[];
  onOpen: (topic: OwedTopic) => void;
}

/** The topics with a check the learner is asked again: each opens its lesson at that check. */
export function ReviewList({ topics, onOpen }: ReviewListProps) {
  return (
    <Card className="p-2">
      <ul>
        {topics.map((owed) => (
          <li key={`${owed.subjectSlug}/${owed.topicIndex}`}>
            <button
              type="button"
              onClick={() => onOpen(owed)}
              className="flex w-full items-center gap-3 rounded-control px-3 py-3 text-start text-sm font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {owed.topic}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted rtl:rotate-180"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
