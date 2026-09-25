import { useEffect, useState } from "react";
import type { LessonView } from "@/lib/lesson";

export type LessonStage = "making" | "objectives" | "slides" | "failed";

export function lessonStage(view: LessonView): LessonStage {
  if (view.lesson?.slides.length) return "slides";
  if (view.status !== "making") return "failed";
  return view.lesson?.objectives.length ? "objectives" : "making";
}

// The objectives are read while the first slide is written: once shown they
// stay long enough to read before the slides take their place.
const OBJECTIVES_MS = 1500;

const minimumFor = (stage: LessonStage) =>
  stage === "objectives" ? OBJECTIVES_MS : 0;

export function useLessonStage(view: LessonView): LessonStage {
  return useHeld(lessonStage(view), minimumFor);
}

/** `value` as shown: a new one waits until the one on screen has been shown
    for `minimumFor(shown)` milliseconds. */
function useHeld<T>(value: T, minimumFor: (shown: T) => number): T {
  const [held, setHeld] = useState(() => ({ value, since: Date.now() }));

  useEffect(() => {
    if (Object.is(value, held.value)) return;
    const wait = minimumFor(held.value) - (Date.now() - held.since);
    const timer = setTimeout(
      () => setHeld({ value, since: Date.now() }),
      Math.max(0, wait),
    );
    return () => clearTimeout(timer);
  }, [value, held, minimumFor]);

  return held.value;
}
