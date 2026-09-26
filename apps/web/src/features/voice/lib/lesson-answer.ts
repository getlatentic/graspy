import type {
  LessonLanguage,
  LessonMove,
  SampleMetadata,
} from "@/lib/voice/voice-types";
import type { KeptAnswer } from "@/lib/voice/answer-store";
import { languagePairOf } from "@/lib/voice/voice-learner";
import { inTime } from "./in-time";
import type { LessonEvent } from "./lesson-state";

// What the server's markers are filed under: a times-table prompt is reasoning about
// multiplication, a said list a recitation of its subject, any other answer reasoning.
function taskAndTopic(move: LessonMove) {
  const kind = move.activity?.kind;
  if (kind === "existing")
    return { task: "reasoning", topic: "multiplication" };
  const topic = move.subject ?? "";
  return kind === "sequence"
    ? { task: "recitation", topic }
    : { task: "reasoning", topic };
}

interface AnswerLearner {
  speaker: string;
  learnerClass: string;
  language: LessonLanguage;
}

/** What one spoken answer to this step says about itself. */
export function answerMetadata(
  move: LessonMove,
  learner: AnswerLearner,
): SampleMetadata {
  return {
    speaker_id: learner.speaker,
    language_pair: languagePairOf(learner.language),
    spoken_language: learner.language,
    lesson_language: learner.language,
    learner_class: learner.learnerClass,
    ...taskAndTopic(move),
    prompt_id: move.activity!.prompt_id,
    plan_id: move.plan_id,
    event_id: move.event_id,
    device: "web",
    consent: { granted: true, scope: "voice_lesson" },
  };
}

/** One spoken answer as the device keeps it, with the step it answers. */
export function answerToKeep(
  move: LessonMove,
  learner: AnswerLearner & { key: string },
  wav: Blob,
  key: string,
  keptAt: number,
): KeptAnswer {
  return {
    key,
    learner: learner.key,
    move,
    metadata: answerMetadata(move, learner),
    wav,
    keptAt,
  };
}

/** The take is checked only once it is kept, so nothing the child said is lost to the network. */
export async function keepTake(
  answer: KeptAnswer,
  keep: (answer: KeptAnswer) => Promise<void>,
  emit: (event: LessonEvent) => void,
  pause?: (ms: number) => Promise<unknown>,
): Promise<void> {
  try {
    await inTime(keep(answer), pause);
  } catch {
    emit({ type: "recordFailed", note: "notSaved" });
    return;
  }
  emit({ type: "recorded", key: answer.key });
}
