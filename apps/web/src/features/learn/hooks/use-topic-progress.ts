import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@/lib/account/use-account";
import type { CurriculumData } from "@/lib/curriculum-record";
import {
  keptRecord,
  learnerRecord,
  planMarks,
  rememberMark,
  type TopicRef,
} from "@/lib/learner-record";
import { copyReadyLessons } from "../lib/lesson-offline";
import {
  learntIn,
  marksFrom,
  nextToLearn,
  NO_MARKS,
  standingOf,
  withMark,
  type TopicMarks,
} from "../lib/topic-marks";

type Topic = Omit<TopicRef, "planId">;

function useRecordedMarks(plan: CurriculumData | null, settled: boolean) {
  const planId = plan?.planId ?? null;
  const [marks, setMarks] = useState<TopicMarks>(NO_MARKS);
  const [asked, setAsked] = useState(0);
  // Signing in or out changes whose record this is.
  const reader = useAccount()?.uid ?? "device";
  const loadKey = settled ? `${reader}:${planId}:${plan?.updatedAt}` : null;
  // Not a dependency: the plan's identity changes on every write; loadKey tracks what matters.
  const planNow = useRef(plan);
  useEffect(() => {
    planNow.current = plan;
  });

  useEffect(() => {
    if (!planId || !loadKey) return;
    // Show the last kept record at once; the server's answer replaces it.
    const kept = keptRecord(planId);
    if (kept) setMarks(marksFrom(planMarks(kept)));
    let current = true;
    learnerRecord(planId)
      .then((record) => {
        const marks = planMarks(record);
        if (current) setMarks(marksFrom(marks));
        const shown = planNow.current;
        if (!shown) return;
        copyReadyLessons(shown, marks.ready).catch((error: unknown) =>
          console.warn("Keeping lessons for offline failed:", error),
        );
      })
      .catch((error) => console.error("Reading progress failed:", error));
    return () => {
      current = false;
    };
  }, [planId, loadKey, asked]);

  const reread = useCallback(() => setAsked((n) => n + 1), []);
  return { marks, setMarks, reread };
}

/** Reads only a `settled` plan: a streaming one or the pre-load placeholder has no progress. */
export function useTopicProgress(
  plan: CurriculumData | null,
  settled: boolean,
) {
  const planId = plan?.planId ?? null;
  const { marks, setMarks, reread } = useRecordedMarks(plan, settled);

  const mark = useCallback(
    (kind: keyof TopicMarks, topic: Topic) => {
      setMarks((prev) => withMark(prev, kind, topic));
      if (planId) rememberMark({ ...topic, planId }, kind);
    },
    [planId, setMarks],
  );

  return useMemo(
    () => ({
      standing: (slug: string, index: number, topic: string) =>
        standingOf(marks, slug, index, topic),
      learntIn: (slug: string, topics: string[]) =>
        learntIn(marks, slug, topics),
      nextToLearn: (slug: string, topics: string[], goal?: number) =>
        nextToLearn(marks, slug, topics, goal),
      learnt: (topic: Topic) => mark("learnt", topic),
      ready: (topic: Topic) => mark("ready", topic),
      reread,
    }),
    [mark, marks, reread],
  );
}

export type TopicProgress = ReturnType<typeof useTopicProgress>;
