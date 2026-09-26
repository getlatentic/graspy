import { unseenAnswer } from "@/lib/voice/answer-store";
import {
  lessonEventHeard,
  lessonMove,
  VoiceError,
} from "@/lib/voice/voice-api";
import type { LessonLanguage, LessonMove } from "@/lib/voice/voice-types";
import { inTime, wait } from "./in-time";
import type { LessonEvent, Phase } from "./lesson-state";

/** A breath between her last word and the next step: long enough to land, short enough not to wait on. */
const TURN_PAUSE_MS = 1_500;

export interface StepLearner {
  key: string;
  learnerClass: string;
  language: LessonLanguage;
}

// A step the server moved past answers 409: the next step is what matters.
async function tellHeard(move: LessonMove, learnerClass: string) {
  try {
    await lessonEventHeard({
      plan_id: move.plan_id!,
      event_id: move.event_id!,
      learner_class: learnerClass,
    });
  } catch (error) {
    if (!(error instanceof VoiceError) || error.code !== "step_not_offered")
      throw error;
  }
}

async function teachersStep(
  learner: StepLearner,
  plan: string | undefined,
): Promise<LessonEvent> {
  const { move } = await lessonMove(
    learner.learnerClass,
    learner.language,
    plan,
  );
  return { type: "loaded", move };
}

// A device whose storage cannot be read, or never answers, still has a lesson: the teacher's step.
async function readUnseen(
  learner: StepLearner,
  plan: string | undefined,
  pause: (ms: number) => Promise<unknown>,
) {
  try {
    return await inTime(unseenAnswer(learner.key, plan), pause);
  } catch (error) {
    console.warn("Reading unseen answers failed:", error);
    return null;
  }
}

/**
 * The step the lesson opens on: an answer the child has not seen the outcome of, else the
 * teacher's next. Until that answer is marked the server offers its question again, and once it
 * is, the step after it.
 */
export async function openingStep(
  learner: StepLearner,
  plan: string | undefined,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<LessonEvent> {
  const answer = await readUnseen(learner, plan, pause);
  if (answer) return { type: "resumed", ...answer };
  return teachersStep(learner, plan);
}

/** The step after one the child has finished, once the server knows a line was heard. */
export async function nextStep(
  phase: Extract<Phase, { name: "moving-on" }>,
  learner: StepLearner,
  plan: string | undefined,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<LessonEvent> {
  if (phase.heard) await tellHeard(phase.move, learner.learnerClass);
  await pause(TURN_PAUSE_MS);
  return teachersStep(learner, plan);
}
