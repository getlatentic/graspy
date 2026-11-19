import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n-context";
import { useSubjectRows } from "@/features/learn/hooks/use-subject-rows";
import { usePlan } from "../learner-context";

/** `bare` leaves out the card, for a place that is already one. */
export function ProgressSummary({ bare = false }: { bare?: boolean }) {
  const { t } = useI18n();
  const { curriculum } = usePlan();
  const rows = useSubjectRows(curriculum);
  const completed = rows.reduce((sum, row) => sum + row.completed, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (total === 0) return null;

  const content = (
    <>
      <p className="nums text-sm text-ink">
        <span className="font-number text-4xl font-semibold text-accent-ink">
          {completed}
        </span>{" "}
        {t("home.topicsCompletedOf", { total })}
      </p>
      <ProgressBar
        percent={(completed / total) * 100}
        label={t("home.topicsCompleted", { completed, total })}
        className={bare ? "h-3" : "h-3 bg-surface"}
      />
    </>
  );
  if (bare) return <div className="flex flex-col gap-3">{content}</div>;
  return (
    <Card className="flex flex-col gap-3 border-accent-line bg-accent-soft">
      {content}
    </Card>
  );
}
