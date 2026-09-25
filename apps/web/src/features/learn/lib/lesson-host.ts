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
    toolCalled: (name, _args, result) => {
      if (name === FINISH_LESSON) {
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
