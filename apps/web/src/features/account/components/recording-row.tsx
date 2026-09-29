import { Button } from "@/components/ui/button";
import type { Recording } from "@/lib/account/voice-recordings-api";
import { useI18n } from "@/lib/i18n-context";
import { lengthOf, whenOf } from "../lib/recording-format";
import { RecordingAudio } from "./recording-audio";

/** One kept recording: when it was made, its lesson and length, to play or delete. */
export function RecordingRow({
  learner,
  recording,
  playing,
  busy,
  onPlay,
  onDelete,
}: {
  learner: string;
  recording: Recording;
  playing: boolean;
  busy: boolean;
  /** Plays this recording, or with `false` stops it. */
  onPlay: (playing: boolean) => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();
  const when = whenOf(recording.recordedAt, locale);
  const details = [
    recording.lesson,
    recording.durationSeconds === null
      ? null
      : lengthOf(recording.durationSeconds),
  ].filter((part) => part !== null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <p className="font-medium text-ink">{when}</p>
          {details.length > 0 && (
            <p className="text-sm text-muted">{details.join(" · ")}</p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={playing}
          aria-label={t(
            playing ? "voiceRecordings.stopAt" : "voiceRecordings.playAt",
            { when },
          )}
          onClick={() => onPlay(!playing)}
        >
          {playing ? t("voiceRecordings.stop") : t("voiceRecordings.play")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t("voiceRecordings.deleteAt", { when })}
          onClick={onDelete}
          disabled={busy}
        >
          {t("voiceRecordings.delete")}
        </Button>
      </div>
      {playing && (
        <RecordingAudio
          learner={learner}
          recording={recording.id}
          onEnded={() => onPlay(false)}
        />
      )}
    </div>
  );
}
