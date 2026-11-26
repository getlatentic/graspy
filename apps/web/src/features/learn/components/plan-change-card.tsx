import type { PendingPlanChange } from "@/features/learn/hooks/use-tutor-actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";

interface PlanChangeCardProps {
  change: PendingPlanChange;
  onConfirm: () => void;
  onDismiss: () => void;
}

/** A change that clears progress waits here for the learner to agree. */
export function PlanChangeCard({
  change,
  onConfirm,
  onDismiss,
}: PlanChangeCardProps) {
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("chat.confirmTitle")}
      className="mb-3 rounded-control border border-warning-line bg-warning-soft p-3 text-sm text-ink"
    >
      <p>
        {change.type === "rebuild_plan"
          ? t("chat.confirmRebuild")
          : t("chat.confirmRemove", { subjects: change.removed.join(", ") })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onConfirm}>
          {t("chat.confirmYes")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {t("chat.confirmNo")}
        </Button>
      </div>
    </div>
  );
}
