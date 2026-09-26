import { Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { getLanguageNativeName } from "@/lib/locale";
import { TeacherStrip } from "@/features/voice/components/teacher-strip";
import { VoiceLessonList } from "@/features/voice/components/voice-lesson-list";
import { useVoiceCatalogue } from "@/features/voice/hooks/use-voice-catalogue";
import {
  useVoiceLearner,
  type VoiceLearner,
} from "@/features/voice/hooks/use-voice-learner";
import { byTopic } from "@/features/voice/lib/catalogue-groups";

function Lessons({ learner }: { learner: VoiceLearner }) {
  const { t } = useI18n();
  const { state, retry } = useVoiceCatalogue(learner);
  if (state.name === "loading")
    return <Spinner className="size-6 text-accent-ink" />;
  if (state.name === "failed") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>{t("voice.loadFailed")}</p>
        <Button variant="secondary" onClick={retry}>
          {t("voice.retry")}
        </Button>
      </div>
    );
  }
  if (state.lessons.length === 0)
    return <p className="text-muted">{t("voice.noLessons")}</p>;
  return (
    <VoiceLessonList
      groups={byTopic(state.lessons)}
      language={learner.language}
    />
  );
}

/** Every voice lesson of the learner's class, by theme, and where they stand on each. */
export default function VoicePage() {
  const { t } = useI18n();
  const learner = useVoiceLearner();
  if (!learner) return <Navigate to="/app/learn" replace />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-balance text-2xl font-semibold text-ink">
        {t("voice.title")}
      </h1>
      <TeacherStrip detail={getLanguageNativeName(learner.language)} />
      <Lessons learner={learner} />
    </div>
  );
}
