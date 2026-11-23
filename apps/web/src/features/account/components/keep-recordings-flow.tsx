import { useCallback, useState } from "react";
import {
  DEFAULT_RETENTION_DAYS,
  recordingsNotice,
} from "@/lib/account/consent-notices";
import { useI18n } from "@/lib/i18n-context";
import { useParentAgreement } from "../hooks/use-parent-agreement";
import type { useVoiceRecordings } from "../hooks/use-voice-recordings";
import { ConsentStep } from "./consent-step";
import { ParentGate } from "./parent-gate";
import { RetentionChoice } from "./retention-choice";

/** A parent agrees to keep the recordings: the notice for the days they choose, then the parent
 * PIN, unless the parent's session is in force already. */
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
  const submit = useCallback(async () => {
    await keep(days);
    onDone();
  }, [keep, days, onDone]);
  const agreement = useParentAgreement(submit);
  if (agreement.asking) {
    return (
      <ParentGate onUnlocked={agreement.proceed} onCancel={agreement.cancel} />
    );
  }
  return (
    <ConsentStep
      heading="h2"
      title={t("voiceRecordings.keep")}
      notice={recordingsNotice(days)}
      busy={false}
      problem={agreement.problem}
      onAgree={agreement.agree}
      onDecline={onCancel}
    >
      <RetentionChoice days={days} onChange={setDays} />
    </ConsentStep>
  );
}
