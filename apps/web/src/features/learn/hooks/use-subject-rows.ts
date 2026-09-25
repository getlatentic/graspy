import { useMemo } from "react";
import { topicsOf, type CurriculumData } from "@/lib/curriculum-record";
import type { SubjectRowData } from "@/features/learn/components/subject-list";
import { goalIndex } from "@/features/learn/lib/curriculum-edit";
import { useProgress } from "../learner-context";

export function useSubjectRows(
  curriculum: CurriculumData | null,
): SubjectRowData[] {
  const { learntIn, nextToLearn } = useProgress();
  return useMemo(() => {
    if (!curriculum?.subjects) return [];

    return curriculum.subjects.map((subject) => {
      const topics = topicsOf(curriculum, subject.slug);
      const next = nextToLearn(
        subject.slug,
        topics,
        goalIndex(curriculum, subject.slug),
      );
      return {
        subject,
        nextTopic: next >= 0 ? (topics[next] ?? null) : null,
        completed: learntIn(subject.slug, topics),
        total: topics.length,
      };
    });
  }, [curriculum, learntIn, nextToLearn]);
}
