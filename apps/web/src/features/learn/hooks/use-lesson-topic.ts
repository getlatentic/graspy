import { useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { topicsOf } from "@/lib/curriculum-record";
import { subjectOf } from "../lib/chat-targets";
import { lessonTarget, nextLesson } from "../lib/lesson-app";
import { usePlan, useProgress } from "../learner-context";

export function useLessonTopic() {
  const params = useParams();
  const { curriculum } = usePlan();
  const { standing } = useProgress();

  const slug = decodeURIComponent(params.subject ?? "");
  const topicIndex = parseInt(params.topicIndex ?? "0", 10);
  const subject = subjectOf(curriculum, slug);
  const topics = useMemo(() => topicsOf(curriculum, slug), [curriculum, slug]);
  const learnt = useCallback(
    (index: number) => standing(slug, index, topics[index]) === "learnt",
    [standing, slug, topics],
  );
  const target = useMemo(
    () =>
      curriculum && subject
        ? lessonTarget(curriculum, subject, topicIndex, learnt)
        : null,
    [curriculum, subject, topicIndex, learnt],
  );

  return {
    slug,
    subject,
    subjectName: subject?.name ?? slug,
    target,
    next:
      curriculum && subject
        ? nextLesson(curriculum, subject, topicIndex, learnt)
        : null,
  };
}
