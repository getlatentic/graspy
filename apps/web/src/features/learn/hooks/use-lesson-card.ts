import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorCard } from "@/lib/a2a/reply-data";
import type { LessonTarget } from "../lib/lesson-app";
import { openLessonOrCopy } from "../lib/lesson-offline";
import { lessonFailure, type LessonFailure } from "../lib/lesson-problem";

// Excludes buildsOn, which changes as progress loads; reopening on it would refetch.
function lessonKey(target: LessonTarget | null): string {
  return target ? JSON.stringify({ ...target, buildsOn: undefined }) : "";
}

/** `madeInChat` names the lesson a chat made for this topic, opened as it is the first time. */
export function useLessonCard(
  target: LessonTarget | null,
  madeInChat?: string,
) {
  const key = lessonKey(target);
  // Not dependencies: `key` tracks what matters of the target, and a retry asks anew.
  const targetNow = useRef(target);
  const madeNow = useRef(madeInChat);
  useEffect(() => {
    targetNow.current = target;
    madeNow.current = madeInChat;
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
    openLessonOrCopy(opening, attempt, madeNow.current).then(
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
