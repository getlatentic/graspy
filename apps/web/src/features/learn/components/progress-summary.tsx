import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n-context";
import { useSubjectRows } from "@/features/learn/hooks/use-subject-rows";
import { usePlan } from "../learner-context";

export function ProgressSummary() {
  const { t } = useI18n();
  const { curriculum } = usePlan();
  const rows = useSubjectRows(curriculum);
  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (total === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <p className="nums text-sm text-ink">
        <span className="font-display text-2xl font-semibold text-accent-ink">
          {completed}
        </span>{" "}
        {t("home.topicsCompletedOf", { total })}
      </p>
      <ProgressBar
        percent={(completed / total) * 100}
        label={t("home.topicsCompleted", { completed, total })}
      />
    </Card>
  );
}
