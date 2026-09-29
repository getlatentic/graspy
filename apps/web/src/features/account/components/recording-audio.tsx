import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { useRecordingAudio } from "../hooks/use-recording-audio";
import { ProblemNote } from "./problem-note";

/** Plays one kept recording, fetched when this is shown and let go of when it is not. */
export function RecordingAudio({
  learner,
  recording,
  onEnded,
}: {
  learner: string;
  recording: string;
  onEnded: () => void;
}) {
  const { t } = useI18n();
  const hearing = useRecordingAudio(learner, recording);
  if (hearing.state === "loading") {
    return <Spinner className="size-5 text-accent-ink" />;
  }
  if (hearing.state !== "ready") {
    return (
      <ProblemNote>
        {t(
          hearing.state === "gone"
            ? "voiceRecordings.gone"
            : "voiceRecordings.playFailed",
        )}
      </ProblemNote>
    );
  }
  return (
    <audio
      src={hearing.url}
      controls
      autoPlay
      onEnded={onEnded}
      aria-label={t("voiceRecordings.play")}
      className="w-full"
    />
  );
}
