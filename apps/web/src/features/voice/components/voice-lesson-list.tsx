import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import type { CatalogueLesson, LessonLanguage } from "@/lib/voice/voice-types";
import type { TopicLessons } from "../lib/catalogue-groups";
import { voiceLessonPath } from "../lib/voice-paths";
import { StandingChip } from "./standing-chip";

function LessonRow({
  lesson,
  language,
}: {
  lesson: CatalogueLesson;
  language: LessonLanguage;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={voiceLessonPath(lesson.current ? undefined : lesson.plan_id)}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors hover:border-accent",
        lesson.current
          ? "border-accent-line bg-accent-soft"
          : "border-line bg-surface",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">
          {lesson.title[language] ?? lesson.title.en}
        </span>
        {lesson.current && (
          <span className="text-xs font-semibold text-accent-ink">
            {t("voice.startHere")}
          </span>
        )}
      </span>
      <StandingChip standing={lesson.standing} />
    </Link>
  );
}

/** A theme, shut until wanted; the one holding the next lesson opens itself. */
function TopicGroup({
  group,
  language,
}: {
  group: TopicLessons;
  language: LessonLanguage;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => group.lessons.some((l) => l.current));
  const done = group.lessons.filter((l) => l.standing !== "untouched").length;
  return (
    <li className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 rounded-2xl px-2 py-2 text-start hover:bg-raised"
      >
        <span className="flex-1 font-semibold text-ink">
          {t(`voice.topics.${group.topic}`)}
        </span>
        <span className="nums text-sm text-muted">
          {done} / {group.lessons.length}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-5 text-accent-ink transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open &&
        group.lessons.map((lesson) => (
          <LessonRow key={lesson.plan_id} lesson={lesson} language={language} />
        ))}
    </li>
  );
}

export function VoiceLessonList({
  groups,
  language,
}: {
  groups: TopicLessons[];
  language: LessonLanguage;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {groups.map((group) => (
        <TopicGroup key={group.topic} group={group} language={language} />
      ))}
    </ul>
  );
}
