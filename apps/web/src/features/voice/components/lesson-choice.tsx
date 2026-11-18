import type { CatalogueLesson, LessonLanguage } from "@/lib/voice/voice-types";
import { currentLesson } from "../lib/mastery";
import { PlayCard } from "./play-card";
import { LessonTiles } from "./lesson-tiles";

/** The next lesson as one big play button, when there is one, and every lesson as a tile. */
export function LessonChoice({
  lessons,
  language,
}: {
  lessons: CatalogueLesson[];
  language: LessonLanguage;
}) {
  const next = currentLesson(lessons);
  return (
    <>
      {next && <PlayCard lesson={next} language={language} />}
      <LessonTiles lessons={lessons} language={language} />
    </>
  );
}
