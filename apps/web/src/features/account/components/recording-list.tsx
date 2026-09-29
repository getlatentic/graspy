import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { VoiceOverview } from "@/lib/account/voice-recordings-api";
import { useI18n } from "@/lib/i18n-context";
import type { useVoiceRecordings } from "../hooks/use-voice-recordings";
import { ConfirmCard } from "./confirm-card";
import { RecordingRow } from "./recording-row";

type Recordings = ReturnType<typeof useVoiceRecordings>;

/** The kept recordings, one of which plays at a time. Kept for as long as the parent keeps
 * them, so an empty list says so. */
export function RecordingList({
  learner,
  voice,
  recordings,
}: {
  learner: string;
  voice: VoiceOverview;
  recordings: Pick<Recordings, "busy" | "more" | "remove" | "removeAll">;
}) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  if (voice.recordings.length === 0) {
    return (
      <p className="text-pretty text-sm text-muted">
        {t("voiceRecordings.empty")}
      </p>
    );
  }
  return (
    <>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {voice.recordings.map((recording) => (
            <li key={recording.id} className="px-5 py-4">
              <RecordingRow
                learner={learner}
                recording={recording}
                playing={playing === recording.id}
                busy={recordings.busy}
                onPlay={(on) => setPlaying(on ? recording.id : null)}
                onDelete={() => void recordings.remove(recording.id)}
              />
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-wrap gap-2">
        {voice.nextBefore !== null && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void recordings.more()}
            disabled={recordings.busy}
          >
            {t("voiceRecordings.more")}
          </Button>
        )}
        {!asking && (
          <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
            {t("voiceRecordings.deleteAll")}
          </Button>
        )}
      </div>
      {asking && (
        <ConfirmCard
          question={t("voiceRecordings.deleteAllConfirm")}
          confirm={t("voiceRecordings.deleteAll")}
          busy={recordings.busy}
          onConfirm={() =>
            void recordings.removeAll().then((done) => done && setAsking(false))
          }
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
