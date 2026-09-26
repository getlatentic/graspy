import type {
  LessonLanguage,
  LessonMove,
  SampleMetadata,
} from "@/lib/voice/voice-types";
import { languagePairOf } from "@/lib/voice/voice-learner";

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

/** What one spoken answer to this step says about itself. */
export function answerMetadata(
  move: LessonMove,
  learner: { speaker: string; learnerClass: string; language: LessonLanguage },
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
