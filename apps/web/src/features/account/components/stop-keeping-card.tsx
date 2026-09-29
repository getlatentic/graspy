import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";

/** Asks whether what was kept goes too, when a parent stops keeping recordings. */
export function StopKeepingCard({
  busy,
  onStop,
  onCancel,
}: {
  busy: boolean;
  onStop: (deleteKept: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card
      role="alertdialog"
      aria-label={t("voiceRecordings.stopTitle")}
      className="flex flex-col gap-3"
    >
      <p className="text-pretty font-semibold text-ink">
        {t("voiceRecordings.stopTitle")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onStop(true)} disabled={busy}>
          {t("voiceRecordings.stopDelete")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onStop(false)}
          disabled={busy}
        >
          {t("voiceRecordings.stopKeep")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t("learners.cancel")}
        </Button>
      </div>
    </Card>
  );
}
