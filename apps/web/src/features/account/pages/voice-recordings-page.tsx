import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { LEARNERS_PAGE } from "@/features/learn/lib/app-sections";
import { KeepingCard } from "../components/keeping-card";
import { ProblemNote } from "../components/problem-note";
import { RecordingList } from "../components/recording-list";
import { useLearners } from "../hooks/use-learners";
import { useVoiceRecordings } from "../hooks/use-voice-recordings";

/** A learner's voice recordings, for their parent: whether graspy keeps them, and the ones kept. */
export default function VoiceRecordingsPage() {
  const { learnerId } = useParams();
  if (!learnerId) return <Navigate to={LEARNERS_PAGE} replace />;
  return <Recordings learner={learnerId} />;
}

function Recordings({ learner }: { learner: string }) {
  const { t } = useI18n();
  const recordings = useVoiceRecordings(learner);
  const { learners } = useLearners();
  const name = learners?.find((one) => one.id === learner)?.name;
  const { voice } = recordings;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          to={LEARNERS_PAGE}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("learners.back")}
        </Link>
        <h1 className="mt-4 text-balance text-2xl font-semibold text-ink">
          {t("voiceRecordings.title")}
        </h1>
        {name && <p className="mt-1 text-muted">{name}</p>}
      </div>
      {voice ? (
        <>
          <KeepingCard consent={voice.consent} recordings={recordings} />
          {(voice.consent || voice.recordings.length > 0) && (
            <RecordingList
              learner={learner}
              voice={voice}
              recordings={recordings}
            />
          )}
        </>
      ) : (
        <Loading failed={recordings.loadFailed} onRetry={recordings.load} />
      )}
      {recordings.failed && <ProblemNote>{t("learners.failed")}</ProblemNote>}
    </div>
  );
}

function Loading({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (!failed) return <Spinner className="size-6 text-accent-ink" />;
  return (
    <div className="flex flex-col gap-3">
      <ProblemNote>{t("learners.loadFailed")}</ProblemNote>
      <Button variant="secondary" className="self-start" onClick={onRetry}>
        {t("learners.tryAgain")}
      </Button>
    </div>
  );
}
