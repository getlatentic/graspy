import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorCard } from "@/lib/a2a/reply-data";
import type { LessonTarget } from "../lib/lesson-app";
import { openLessonOrCopy } from "../lib/lesson-offline";

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
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    const opening = targetNow.current;
    if (!key || !opening) return;
    let current = true;
    setCard(null);
    setUnreachable(false);
    openLessonOrCopy(opening, attempt).then(
      (opened) => current && setCard(opened),
      (error: unknown) => {
        console.error("Opening the lesson failed:", error);
        if (current) setUnreachable(true);
      },
    );
    return () => {
      current = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { key, card, unreachable, retry };
}
