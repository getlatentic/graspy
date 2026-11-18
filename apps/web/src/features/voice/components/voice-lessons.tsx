import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { getLanguageNativeName } from "@/lib/locale";
import { useVoiceCatalogue } from "../hooks/use-voice-catalogue";
import { useVoiceLearner, type VoiceLearner } from "../hooks/use-voice-learner";
import { LessonChoice } from "./lesson-choice";
import { TeacherHeader } from "./teacher-header";

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
  return <LessonChoice lessons={state.lessons} language={learner.language} />;
}

/** The next voice lesson as one big play button, then every lesson of the class as a tile;
 * nothing for a class without voice lessons. */
export function VoiceLessons() {
  const learner = useVoiceLearner();
  if (!learner) return null;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <TeacherHeader language={getLanguageNativeName(learner.language)} />
      <Lessons learner={learner} />
    </div>
  );
}
