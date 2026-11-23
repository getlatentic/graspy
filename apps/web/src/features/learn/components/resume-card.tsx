import { ArrowRight, ChevronRight } from "lucide-react";
import { artSizes } from "@/components/brand/art-urls";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { SubjectPicture } from "@/features/learn/components/subject-picture";
import { knownBand, type AgeBand } from "@/lib/age-band";
import { useAgeBand } from "@/lib/use-age-band";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import type { CurrentTopic } from "@/features/learn/lib/current-topic";

const UP_NEXT = 3;

// A child's picture leads the card; a teen's is a small mark beside the title.
const PICTURE_SIZE: Record<AgeBand, string> = {
  child: "size-16 sm:size-24 lg:size-32",
  tween: "size-16 sm:size-24 lg:size-28",
  teen: "size-12 sm:size-16 lg:size-20",
};

// The widths of PICTURE_SIZE, in rem.
const PICTURE_SIZES: Record<AgeBand, string> = {
  child: artSizes([{ rem: 4 }, { from: 40, rem: 6 }, { from: 64, rem: 8 }]),
  tween: artSizes([{ rem: 4 }, { from: 40, rem: 6 }, { from: 64, rem: 7 }]),
  teen: artSizes([{ rem: 3 }, { from: 40, rem: 4 }, { from: 64, rem: 5 }]),
};

interface ResumeCardProps {
  current: CurrentTopic;
  grade: string;
  completed: number;
  onOpenTopic: (index: number) => void;
  className?: string;
}

export function ResumeCard({
  current,
  grade,
  completed,
  onOpenTopic,
  className,
}: ResumeCardProps) {
  const { t } = useI18n();
  const band = knownBand(useAgeBand());
  const { subject, topic, topics, topicIndex, started } = current;
  const onStart = () => onOpenTopic(topicIndex);

  return (
    <Card className={cn("p-0", className)}>
      <div className="p-3 sm:p-6">
        <div className="flex items-center gap-3 sm:items-start sm:gap-5">
          <SubjectPicture
            name={subject.name}
            priority
            sizes={PICTURE_SIZES[band]}
            frame={band === "teen" ? "small" : "full"}
            className={PICTURE_SIZE[band]}
            iconClassName="size-8 sm:size-10 lg:size-14"
          />
          <ResumeProgress
            topic={topic}
            meta={t("home.resumeMeta", { subject: subject.name, grade })}
            completed={completed}
            total={topics.length}
          />
          <Button
            size="sm"
            onClick={onStart}
            className="shrink-0 rounded-full px-4 py-2 sm:hidden"
          >
            {started ? t("home.continue") : t("home.start")}
          </Button>
        </div>
        <Button
          size="lg"
          onClick={onStart}
          className="mt-4 hidden rounded-full px-8 sm:inline-flex"
        >
          {started ? t("home.continueLearning") : t("home.startLearning")}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Button>
      </div>
      <UpNext topics={topics} from={topicIndex + 1} onOpenTopic={onOpenTopic} />
    </Card>
  );
}

interface ResumeProgressProps {
  topic: string;
  meta: string;
  completed: number;
  total: number;
}

function ResumeProgress({
  topic,
  meta,
  completed,
  total,
}: ResumeProgressProps) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 flex-1">
      <h3 className="line-clamp-2 font-sans text-sm font-semibold text-ink sm:text-xl lg:text-2xl">
        {topic}
      </h3>
      <p className="mt-0.5 truncate text-xs text-muted sm:mt-1 sm:text-sm">
        {meta}
      </p>
      <ProgressBar
        percent={(completed / total) * 100}
        label=""
        className="mt-2 h-2.5 sm:mt-4 sm:h-3"
      />
      <p className="nums mt-1 text-xs text-muted sm:mt-2 sm:text-sm">
        {t("home.topicsCompleted", { completed, total })}
      </p>
    </div>
  );
}

interface UpNextProps {
  topics: string[];
  from: number;
  onOpenTopic: (index: number) => void;
}

function UpNext({ topics, from, onOpenTopic }: UpNextProps) {
  const { t } = useI18n();
  const upNext = topics
    .map((title, index) => ({ title, index }))
    .slice(from, from + UP_NEXT);
  if (upNext.length === 0) return null;
  return (
    <div className="hidden border-t border-line px-6 py-4 sm:block">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {t("home.upNext")}
      </p>
      <ul>
        {upNext.map(({ title, index }, place) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => onOpenTopic(index)}
              className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 py-2.5 text-start text-sm text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "nums flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  place === 0
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line text-muted",
                )}
              >
                {place + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <ChevronRight
                className="size-4 shrink-0 text-muted rtl:rotate-180"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
