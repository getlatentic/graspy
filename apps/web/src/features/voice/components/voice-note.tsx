import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";

/** Shown once per learner, before their first voice lesson. */
export function VoiceNote({ onOk }: { onOk: () => void }) {
  const { t } = useI18n();
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
