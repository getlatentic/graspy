import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { getLanguageNativeName } from "@/lib/locale";
import { useVoiceCatalogue } from "../hooks/use-voice-catalogue";
import { useVoiceLearner, type VoiceLearner } from "../hooks/use-voice-learner";
import { byTopic } from "../lib/catalogue-groups";
import { TeacherStrip } from "./teacher-strip";
import { VoiceLessonList } from "./voice-lesson-list";

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

/** Every voice lesson of the learner's class, by theme, and where they stand on each; nothing for a
 * class without voice lessons. */
export function VoiceLessons() {
  const { t } = useI18n();
  const learner = useVoiceLearner();
  if (!learner) return null;
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
