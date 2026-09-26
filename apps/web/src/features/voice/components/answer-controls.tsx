import { Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import type { Phase } from "../lib/lesson-state";
import { VoiceWave } from "./voice-wave";

interface AnswerControlsProps {
  phase: Phase;
  levels: number[];
  onRecord: () => void;
  onStop: () => void;
  onHearAgain: () => void;
}

/** What the child can do now: record, finish speaking, or wait while it is checked. */
export function AnswerControls({
  phase,
  levels,
  onRecord,
  onStop,
  onHearAgain,
}: AnswerControlsProps) {
  const { t } = useI18n();
  if (phase.name === "your-turn") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onRecord} className="rounded-full">
          <Mic className="size-5" aria-hidden="true" />
          {t("voice.lesson.record")}
        </Button>
        <Button variant="ghost" onClick={onHearAgain}>
          <Volume2 className="size-4" aria-hidden="true" />
          {t("voice.lesson.hearAgain")}
        </Button>
      </div>
    );
  }
  if (phase.name === "recording") {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-medium text-accent-ink">
          {t("voice.lesson.speakNow")}
        </p>
        <VoiceWave levels={levels} />
        <Button
          variant="secondary"
          onClick={onStop}
          className="self-start rounded-full"
        >
          <Square className="size-4" aria-hidden="true" />
          {t("voice.lesson.done")}
        </Button>
      </div>
    );
  }
  if (phase.name === "checking") {
    return (
      <p role="status" className="flex items-center gap-2 text-muted">
        <Spinner className="text-accent-ink" />
        {t("voice.lesson.checking")}
      </p>
    );
  }
  if (phase.name === "kept") {
    return (
      <p role="status" className="text-muted">
        {t("voice.lesson.kept")}
      </p>
    );
  }
  return null;
}
