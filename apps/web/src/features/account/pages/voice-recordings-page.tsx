import { Navigate, useParams } from "react-router";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { LEARNERS_PAGE } from "@/features/learn/lib/app-sections";
import { ParentSignIn } from "../components/parent-sign-in";
import { KeepingCard } from "../components/keeping-card";
import { ProblemNote } from "../components/problem-note";
import { RecordingList } from "../components/recording-list";
import { useLearners } from "../hooks/use-learners";
import {
  useVoiceRecordings,
  type LoadProblem,
} from "../hooks/use-voice-recordings";

/** A learner's voice recordings, for their parent: whether graspy keeps them, and the ones kept. */
export default function VoiceRecordingsPage() {
  const { learnerId } = useParams();
  if (!learnerId) return <Navigate to={LEARNERS_PAGE} replace />;
  return <Recordings key={learnerId} learner={learnerId} />;
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
        <BackLink to={LEARNERS_PAGE}>{t("learners.back")}</BackLink>
        <h1 className="mt-4 text-balance text-2xl font-semibold text-ink">
          {t("voiceRecordings.title")}
        </h1>
        {name && <p className="mt-1 text-muted">{name}</p>}
      </div>
      {recordings.needsParent ? (
        <ParentSignIn start={recordings.startAsParent} />
      ) : voice ? (
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
        <Loading problem={recordings.loadProblem} onRetry={recordings.load} />
      )}
      {recordings.failed && <ProblemNote>{t("learners.failed")}</ProblemNote>}
    </div>
  );
}

function Loading({
  problem,
  onRetry,
}: {
  problem: LoadProblem | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (!problem) return <Spinner className="size-6 text-accent-ink" />;
  if (problem === "notFound") {
    return <ProblemNote>{t("voiceRecordings.notFound")}</ProblemNote>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ProblemNote>{t("learners.loadFailed")}</ProblemNote>
      <Button variant="secondary" className="self-start" onClick={onRetry}>
        {t("learners.tryAgain")}
      </Button>
    </div>
  );
}
