import { Link } from "react-router";
import { Play } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import type { CatalogueLesson, LessonLanguage } from "@/lib/voice/voice-types";
import { MASTERY_DAYS, daysRight } from "../lib/mastery";
import { voiceLessonPath } from "../lib/voice-paths";

/** The days the lesson was right, one dot for each day needed. */
function DayDots({ right }: { right: number }) {
  return (
    <span aria-hidden="true" className="flex gap-2">
      {Array.from({ length: MASTERY_DAYS }, (_, day) => (
        <span
          key={day}
          className={cn(
            "size-4 rounded-full border-2 border-accent",
            day < right ? "bg-accent" : "bg-surface",
          )}
        />
      ))}
    </span>
  );
}

/** The lesson the teacher gives next: one big play button, which is the whole card. */
export function PlayCard({
  lesson,
  language,
}: {
  lesson: CatalogueLesson;
  language: LessonLanguage;
}) {
  const { t } = useI18n();
  const right = daysRight(lesson);
  return (
    <Link
      to={voiceLessonPath()}
      className="flex flex-col items-center gap-4 rounded-3xl border border-accent-line bg-accent-soft p-6 text-center transition-colors hover:border-accent sm:flex-row sm:gap-8 sm:p-8 sm:text-start"
    >
      <span
        role="img"
        aria-label={t("voice.start")}
        className="flex size-28 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent sm:size-36"
      >
        <Play aria-hidden="true" className="size-12 fill-current sm:size-16" />
      </span>
      <span className="flex min-w-0 flex-col items-center gap-3 sm:items-start">
        <span className="sr-only">{t("voice.next")}</span>
        <span className="break-words font-display text-xl font-semibold text-ink sm:text-2xl">
          {lesson.title[language] ?? lesson.title.en}
        </span>
        <DayDots right={right} />
        <span className="sr-only">
          {t("voice.daysRight", { count: right, total: MASTERY_DAYS })}
        </span>
      </span>
    </Link>
  );
}
