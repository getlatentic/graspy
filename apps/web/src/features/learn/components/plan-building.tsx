import { Check, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import {
  buildingRows,
  type BuildingRow,
  type RowState,
} from "@/features/learn/lib/plan-building-rows";
import { usePlan } from "@/features/learn/learner-context";

/** The plan being made, with what it has so far: the learner sees it move, not a spinner. */
export function PlanBuilding() {
  const { t } = useI18n();
  const { curriculum, isPrimingLesson } = usePlan();
  const rows = buildingRows(curriculum, isPrimingLesson);

  return (
    <section aria-busy="true" aria-labelledby="plan-building-title">
      <Card className="flex flex-col gap-4">
        <h2
          id="plan-building-title"
          className="flex items-center gap-3 text-sm font-semibold text-ink"
        >
          <Spinner className="size-5 text-accent-ink" />
          {t("planBuilding.making")}
        </h2>
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <ProgressRow key={rowKey(row)} row={row} />
          ))}
        </ul>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {t("onboarding.generating.wait")}
        </p>
      </Card>
    </section>
  );
}

const rowKey = (row: BuildingRow) =>
  row.kind === "subject" ? row.slug : row.kind;

function ProgressRow({ row }: { row: BuildingRow }) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "flex items-center gap-3 text-sm",
        row.state === "waiting" ? "text-subtle" : "text-ink",
      )}
    >
      <Marker state={row.state} />
      <span className="min-w-0 flex-1 truncate">{rowLabel(row, t)}</span>
      {row.kind === "subject" && row.topicCount > 0 && (
        <span className="nums shrink-0 text-muted">
          {t(
            row.topicCount === 1 ? "planBuilding.topic" : "planBuilding.topics",
            {
              count: row.topicCount,
            },
          )}
        </span>
      )}
    </li>
  );
}

function rowLabel(row: BuildingRow, t: ReturnType<typeof useI18n>["t"]) {
  if (row.kind === "subject") return row.name;
  return t(
    row.kind === "choosing" ? "planBuilding.choosing" : "planBuilding.lesson",
  );
}

function Marker({ state }: { state: RowState }) {
  if (state === "done")
    return (
      <Check className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-5 shrink-0 rounded-full border-2",
        state === "working"
          ? "animate-spin border-accent border-t-transparent motion-reduce:animate-none"
          : "border-line",
      )}
    />
  );
}
