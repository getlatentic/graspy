import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorCard } from "@/lib/a2a/reply-data";
import type { LessonTarget } from "../lib/lesson-app";
import { openLessonOrCopy } from "../lib/lesson-offline";
import { lessonFailure, type LessonFailure } from "../lib/lesson-problem";

// Excludes buildsOn, which changes as progress loads; reopening on it would refetch.
function lessonKey(target: LessonTarget | null): string {
  return target ? JSON.stringify({ ...target, buildsOn: undefined }) : "";
}

export function useLessonCard(target: LessonTarget | null) {
  const key = lessonKey(target);
  // Not a dependency: `key` tracks what matters of it.
  const targetNow = useRef(target);
  useEffect(() => {
    targetNow.current = target;
  });

  const [attempt, setAttempt] = useState(0);
  const [card, setCard] = useState<TutorCard | null>(null);
  const [failure, setFailure] = useState<LessonFailure | null>(null);

  useEffect(() => {
    const opening = targetNow.current;
    if (!key || !opening) return;
    let current = true;
    setCard(null);
    setFailure(null);
    openLessonOrCopy(opening, attempt).then(
      (opened) => current && setCard(opened),
      (error: unknown) => {
        console.error("Opening the lesson failed:", error);
        if (current) setFailure(lessonFailure(error));
      },
    );
    return () => {
      current = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { key, card, failure, retry };
}
