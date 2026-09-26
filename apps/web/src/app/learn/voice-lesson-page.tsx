import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";
import { markVoiceNoteSeen, voiceNoteSeen } from "@/lib/voice/voice-consent";
import { AnswerControls } from "@/features/voice/components/answer-controls";
import { LessonStage } from "@/features/voice/components/lesson-stage";
import { VoiceNote } from "@/features/voice/components/voice-note";
import {
  useVoiceLearner,
  type VoiceLearner,
} from "@/features/voice/hooks/use-voice-learner";
import { useVoiceLesson } from "@/features/voice/hooks/use-voice-lesson";
import { VOICE_PAGE } from "@/features/voice/lib/voice-paths";

function Lesson({ learner, plan }: { learner: VoiceLearner; plan?: string }) {
  const { t } = useI18n();
  const lesson = useVoiceLesson(learner, plan);
  const [noted, setNoted] = useState(() => voiceNoteSeen(learner.key));
  const { phase, note } = lesson.state;

  if (phase.name === "idle") {
    if (!noted) {
      return (
        <VoiceNote
          onOk={() => {
            markVoiceNoteSeen(learner.key);
            setNoted(true);
            lesson.start();
          }}
        />
      );
    }
    return (
      <Button
        size="lg"
        onClick={lesson.start}
        className="self-start rounded-full"
      >
        {t("voice.start")}
      </Button>
    );
  }
  return (
    <>
      <LessonStage
        state={lesson.state}
        language={learner.language}
        onRetry={lesson.retry}
      />
      {note && (
        <p role="alert" className="font-medium text-danger">
          {t(`voice.problem.${note}`)}
        </p>
      )}
      <AnswerControls
        phase={phase}
        levels={lesson.levels}
        onRecord={() => "move" in phase && void lesson.record(phase.move)}
        onStop={lesson.stop}
        onHearAgain={lesson.hearAgain}
        onCarryOn={lesson.carryOn}
      />
    </>
  );
}

/** One voice lesson: the one the teacher gives next, or the one the learner chose. */
export default function VoiceLessonPage() {
  const { t } = useI18n();
  const learner = useVoiceLearner();
  const plan = useSearchParams()[0].get("plan") ?? undefined;
  if (!learner) return <Navigate to="/app/learn" replace />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        to={VOICE_PAGE}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-accent-ink hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t("voice.title")}
      </Link>
      <Lesson
        key={`${learner.key}:${plan ?? ""}`}
        learner={learner}
        plan={plan}
      />
    </div>
  );
}
