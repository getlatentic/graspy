import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";
import { useFocusInto } from "../hooks/use-focus-into";

/** Asks before something that cannot be undone. */
export function ConfirmCard({
  question,
  confirm,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirm: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useFocusInto<HTMLDivElement>();
  return (
    <Card
      ref={ref}
      role="alertdialog"
      aria-label={question}
      tabIndex={-1}
      className="flex flex-col gap-3 border-danger outline-none"
    >
      <p className="text-pretty text-sm text-ink">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onConfirm} disabled={busy}>
          {confirm}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t("learners.cancel")}
        </Button>
      </div>
    </Card>
  );
}
