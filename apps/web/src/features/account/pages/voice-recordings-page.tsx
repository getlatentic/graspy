import { Navigate, useParams } from "react-router";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { LEARNERS_PAGE } from "@/features/learn/lib/app-sections";
import { ParentGate } from "../components/parent-gate";
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
  const { learners } = useLearners();
  const name = learners?.find((one) => one.id === learner)?.name;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <BackLink to={LEARNERS_PAGE}>{t("learners.back")}</BackLink>
        <h1 className="mt-4 text-balance text-2xl font-semibold text-ink">
          {t("voiceRecordings.title")}
        </h1>
        {name && <p className="mt-1 text-muted">{name}</p>}
      </div>
      <ParentGate framed>
        <Kept learner={learner} />
      </ParentGate>
    </div>
  );
}

/** Behind the parent gate: what is asked of the server needs the parent's session. */
function Kept({ learner }: { learner: string }) {
  const { t } = useI18n();
  const recordings = useVoiceRecordings(learner);
  const { voice } = recordings;
  return (
    <>
      {voice ? (
        <div className="flex flex-col gap-6">
          <KeepingCard consent={voice.consent} recordings={recordings} />
          {(voice.consent || voice.recordings.length > 0) && (
            <RecordingList
              learner={learner}
              voice={voice}
              recordings={recordings}
            />
          )}
        </div>
      ) : (
        <Loading problem={recordings.loadProblem} onRetry={recordings.load} />
      )}
      {recordings.failed && <ProblemNote>{t("learners.failed")}</ProblemNote>}
    </>
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
