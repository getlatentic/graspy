import { onceForAnswers } from "@/features/haptics/lib/answer-cue";
import { haptics } from "@/features/haptics/lib/haptics";
import type { TutorCard } from "@/lib/a2a/reply-data";
import { callOrKeep } from "@/lib/mcp/outbox";
import type { ViewHost } from "../ui-apps/view-bridge";
import {
  FINISH_LESSON,
  isLessonTool,
  lessonStateOf,
  objectivesOf,
  type LessonTarget,
} from "./lesson-app";
import { keepIfWhole, lessonToolOrCopy } from "./lesson-offline";

interface LessonHostDeps {
  target: LessonTarget;
  card: TutorCard;
  marks: {
    learnt: (topic: LessonTarget) => void;
    ready: (topic: LessonTarget) => void;
  };
  onFinish: () => void;
  onObjectives: (objectives: string[]) => void;
}

const feltOnce = onceForAnswers();

/** Lesson tools answer from the device's copy when offline. */
export function lessonHost({
  target,
  card,
  marks,
  onFinish,
  onObjectives,
}: LessonHostDeps): ViewHost {
  return {
    callTool: (name, args) =>
      isLessonTool(name)
        ? lessonToolOrCopy(target, name, args)
        : callOrKeep(name, args),
    // The check is graded in the view, so the tap is felt as the call arrives
    // and not after the round trip; a choice sent again is not felt again.
    toolCalling: (name, args) => {
      const cue = feltOnce(name, args);
      if (cue) haptics.trigger(cue);
    },
    toolCalled: (name, _args, result) => {
      if (name === FINISH_LESSON) {
        haptics.trigger("lessonComplete");
        marks.learnt(target);
        onFinish();
        return;
      }
      const state = isLessonTool(name) ? lessonStateOf(result) : null;
      const objectives = state ? objectivesOf(result) : [];
      if (objectives.length > 0) onObjectives(objectives);
      if (state?.status !== "ready" || !state.whole) return;
      marks.ready(target);
      void keepIfWhole(target, { ...card, toolResult: result });
    },
    message: () => false,
  };
}
