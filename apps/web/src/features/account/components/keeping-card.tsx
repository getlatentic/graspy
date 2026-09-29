import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n-context";
import type { RecordingsConsent } from "@/lib/account/voice-recordings-api";
import type { useVoiceRecordings } from "../hooks/use-voice-recordings";
import { KeepRecordingsFlow } from "./keep-recordings-flow";
import { StopKeepingCard } from "./stop-keeping-card";

type Recordings = ReturnType<typeof useVoiceRecordings>;
type Mode = "shown" | "agreeing" | "stopping";

/** Whether graspy keeps the learner's recordings, and the switch that changes it. Turning it
 * on asks the parent to agree; turning it off asks what becomes of what was kept. */
export function KeepingCard({
  consent,
  recordings,
}: {
  consent: RecordingsConsent | null;
  recordings: Pick<Recordings, "busy" | "keep" | "stop">;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("shown");
  const back = () => setMode("shown");

  if (mode === "agreeing") {
    return (
      <Card>
        <KeepRecordingsFlow
          keep={recordings.keep}
          onDone={back}
          onCancel={back}
        />
      </Card>
    );
  }
  return (
    <>
      <Card className="flex flex-col gap-3">
        <Switch
          label={t("voiceRecordings.keep")}
          checked={consent !== null}
          disabled={recordings.busy || mode === "stopping"}
          onChange={(on) => setMode(on ? "agreeing" : "stopping")}
        />
        <p className="text-pretty text-sm text-muted">
          {consent
            ? t("voiceRecordings.keptFor", { days: consent.retentionDays })
            : t("voiceRecordings.off")}
        </p>
      </Card>
      {mode === "stopping" && (
        <StopKeepingCard
          busy={recordings.busy}
          onStop={(deleteKept) =>
            void recordings
              .stop(deleteKept)
              .then((stopped) => stopped && back())
          }
          onCancel={back}
        />
      )}
    </>
  );
}
