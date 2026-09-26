import type { CatalogueLesson } from "@/lib/voice/voice-types";

export interface TopicLessons {
  topic: string;
  lessons: CatalogueLesson[];
}

/** Lessons under the theme they teach, in teaching order: eight headings, not one wall. */
export function byTopic(lessons: CatalogueLesson[]): TopicLessons[] {
  const groups = new Map<string, CatalogueLesson[]>();
  for (const lesson of lessons) {
    const key = `${lesson.subject}/${lesson.topic}`;
    groups.set(key, [...(groups.get(key) ?? []), lesson]);
  }
  return [...groups.values()].map((group) => ({
    topic: group[0].topic,
    lessons: group,
  }));
}
