import { useCallback, useState } from "react";
import {
  DEFAULT_RETENTION_DAYS,
  recordingsNotice,
} from "@/lib/account/consent-notices";
import { useI18n } from "@/lib/i18n-context";
import { useAgreement } from "../hooks/use-agreement";
import type { useVoiceRecordings } from "../hooks/use-voice-recordings";
import { ConsentStep } from "./consent-step";
import { RetentionChoice } from "./retention-choice";

/** A parent agrees to keep the recordings: the notice for the days they choose, then signing
 * in again. */
export function KeepRecordingsFlow({
  keep,
  onDone,
  onCancel,
}: {
  keep: ReturnType<typeof useVoiceRecordings>["keep"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [days, setDays] = useState(DEFAULT_RETENTION_DAYS);
  const submit = useCallback(
    async (firebaseIdToken: string) => {
      await keep(days, firebaseIdToken);
      onDone();
    },
    [keep, days, onDone],
  );
  const agreement = useAgreement(submit);
  return (
    <ConsentStep
      heading="h2"
      title={t("voiceRecordings.keep")}
      notice={recordingsNotice(days)}
      busy={agreement.busy}
      problem={agreement.problem}
      onAgree={agreement.agree}
      onDecline={onCancel}
    >
      <RetentionChoice days={days} onChange={setDays} />
    </ConsentStep>
  );
}
