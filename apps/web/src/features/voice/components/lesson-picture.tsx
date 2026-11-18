import type { CatalogueLesson } from "@/lib/voice/voice-types";
import { lessonPicture } from "../lib/lesson-pictures";
import { themeIcon } from "../lib/theme-icons";

/** The lesson's picture as a square; a lesson without one shows its theme's icon on a soft square. */
export function LessonPicture({ lesson }: { lesson: CatalogueLesson }) {
  const url = lessonPicture(lesson);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        className="aspect-square w-full rounded-xl object-cover"
      />
    );
  }
  const Icon = themeIcon(lesson.topic);
  return (
    <span
      aria-hidden="true"
      className="flex aspect-square w-full items-center justify-center rounded-xl bg-accent-soft text-accent-ink"
    >
      <Icon className="size-1/3" />
    </span>
  );
}
