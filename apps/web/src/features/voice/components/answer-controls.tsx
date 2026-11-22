import { useEffect, useRef } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptics } from "@/features/haptics/lib/haptics";
import { Spinner } from "@/components/ui/spinner";
import { useOnline } from "@/hooks/use-online";
import { useI18n } from "@/lib/i18n-context";
import type { Phase } from "../lib/lesson-state";
import { VoiceWave } from "./voice-wave";

/** The Record press is a click of a few milliseconds and a 12 ms buzz; this is long enough for both. */
export const PRESS_LEAD_MS = 60;

interface AnswerControlsProps {
  phase: Phase;
  levels: number[];
  onRecord: () => void;
  onStop: () => void;
  onHearAgain: () => void;
  onCarryOn: () => void;
}

/** An answer kept on the device, and a way on while it waits. */
function KeptAnswer({ onCarryOn }: { onCarryOn: () => void }) {
  const { t } = useI18n();
  const online = useOnline();
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="status" className="text-muted">
        {online ? t("voice.lesson.keptOnline") : t("voice.lesson.kept")}
      </p>
      <Button variant="secondary" onClick={onCarryOn}>
        {t("voice.lesson.continue")}
      </Button>
    </div>
  );
}

/** What the child can do now: record, finish speaking, wait while it is checked, or carry on. */
export function AnswerControls({
  phase,
  levels,
  onRecord,
  onStop,
  onHearAgain,
  onCarryOn,
}: AnswerControlsProps) {
  const { t } = useI18n();
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (recordTimer.current) clearTimeout(recordTimer.current);
    },
    [],
  );
  const record = () => {
    // A second tap while the first is waiting would start a second take.
    if (recordTimer.current) return;
    // Opening the microphone holds every cue quiet and cuts one sounding, so the
    // press is given this long to be felt and heard first. Recording starts
    // whatever the cue does.
    recordTimer.current = setTimeout(() => {
      recordTimer.current = null;
      onRecord();
    }, PRESS_LEAD_MS);
    haptics.trigger("press");
  };
  if (phase.name === "your-turn") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={record}
          className="rounded-full"
          data-no-sound
        >
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
  if (phase.name === "saving" || phase.name === "checking") {
    return (
      <p role="status" className="flex items-center gap-2 text-muted">
        <Spinner className="text-accent-ink" />
        {t("voice.lesson.checking")}
      </p>
    );
  }
  if (phase.name === "kept") return <KeptAnswer onCarryOn={onCarryOn} />;
  return null;
}
