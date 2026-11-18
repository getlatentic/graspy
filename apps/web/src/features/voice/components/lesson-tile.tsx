import { Link } from "react-router";
import { useI18n } from "@/lib/i18n-context";
import type { CatalogueLesson, LessonLanguage } from "@/lib/voice/voice-types";
import { voiceLessonPath } from "../lib/voice-paths";
import { LessonPicture } from "./lesson-picture";
import { StandingBadge } from "./standing-badge";

/** One lesson, as its picture with a badge for where the learner stands, and its title. */
export function LessonTile({
  lesson,
  language,
}: {
  lesson: CatalogueLesson;
  language: LessonLanguage;
}) {
  const { t } = useI18n();
  return (
    <li>
      <Link
        to={voiceLessonPath(lesson.current ? undefined : lesson.plan_id)}
        className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-2 transition-colors hover:border-accent"
      >
        <span className="relative block">
          <LessonPicture lesson={lesson} />
          <span className="absolute end-2 top-2">
            <StandingBadge standing={lesson.standing} />
          </span>
        </span>
        <span className="break-words px-1 pb-1 font-medium text-ink">
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
