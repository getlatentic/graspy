import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBackHandler } from "@/hooks/use-back-handler";
import { useI18n } from "@/lib/i18n-context";

/** Shown once per learner, before their first voice lesson. */
export function VoiceNote({ onOk }: { onOk: () => void }) {
  const { t } = useI18n();
  // Back on a TV is a way to say OK, so it does not leave the lesson behind the note.
  useBackHandler(true, onOk);
  return (
    <Card
      role="dialog"
      aria-label={t("voice.title")}
      className="flex flex-col gap-4"
    >
      <p className="text-pretty text-ink">{t("voice.note")}</p>
      <Button onClick={onOk} className="self-start">
        {t("voice.ok")}
      </Button>
    </Card>
  );
}
