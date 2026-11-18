import type { CatalogueLesson, LessonLanguage } from "@/lib/voice/voice-types";
import { LessonTile } from "./lesson-tile";

/** Every lesson as a tile, in teaching order; the picture on each tile says its theme. Nothing is
 * folded away, so each lesson is one link from Home. */
export function LessonTiles({
  lessons,
  language,
}: {
  lessons: CatalogueLesson[];
  language: LessonLanguage;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {lessons.map((lesson) => (
        <LessonTile key={lesson.plan_id} lesson={lesson} language={language} />
      ))}
    </ul>
  );
}
