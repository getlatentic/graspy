import { Link } from "react-router";
import { useI18n } from "@/lib/i18n-context";
import type { CatalogueLesson, LessonLanguage } from "@/lib/voice/voice-types";
import { themeIcon } from "../lib/theme-icons";
import { voiceLessonPath } from "../lib/voice-paths";
import { StandingSymbol } from "./standing-symbol";

/** One lesson, as a picture for its theme, its title and a symbol for where the learner stands. */
export function LessonTile({
  lesson,
  language,
}: {
  lesson: CatalogueLesson;
  language: LessonLanguage;
}) {
  const { t } = useI18n();
  const Icon = themeIcon(lesson.topic);
  return (
    <li>
      <Link
        to={voiceLessonPath(lesson.current ? undefined : lesson.plan_id)}
        className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent"
      >
        <span className="flex items-start justify-between gap-2">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink"
          >
            <Icon className="size-6" />
          </span>
          <StandingSymbol standing={lesson.standing} />
        </span>
        <span className="break-words font-medium text-ink">
          {lesson.title[language] ?? lesson.title.en}
        </span>
        <span className="sr-only">
          {t(`voice.topics.${lesson.topic}`)}.{" "}
          {t(`voice.standing.${lesson.standing}`)}
        </span>
      </Link>
    </li>
  );
}
