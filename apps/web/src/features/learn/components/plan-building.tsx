import { Check, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useI18n, type Translate } from "@/lib/i18n-context";
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
  const subjects = rows.filter((row) => row.kind === "subject");
  const done = subjects.filter((row) => row.state === "done").length;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">
        {t("planBuilding.making")}
      </h2>
      <p role="status" className="sr-only">
        {subjects.length > 0 &&
          t("planBuilding.progress", { done, total: subjects.length })}
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <ProgressRow key={rowKey(row)} row={row} t={t} />
        ))}
      </ul>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        {t("onboarding.generating.wait")}
      </p>
    </Card>
  );
}

const rowKey = (row: BuildingRow) =>
  row.kind === "subject" ? `subject:${row.slug}` : row.kind;

function ProgressRow({ row, t }: { row: BuildingRow; t: Translate }) {
  return (
    <li
      data-state={row.state}
      className={cn(
        "flex items-center gap-3 text-sm",
        row.state === "waiting" ? "text-muted" : "text-ink",
      )}
    >
      <Marker state={row.state} />
      <span className="min-w-0 flex-1 break-words">{rowLabel(row, t)}</span>
      {row.kind === "subject" && row.topicCount > 0 && (
        <span className="nums shrink-0 text-muted">
          {t(
            row.topicCount === 1 ? "planBuilding.topic" : "planBuilding.topics",
            { count: row.topicCount },
          )}
        </span>
      )}
      <span className="sr-only">{t(`planBuilding.${row.state}`)}</span>
    </li>
  );
}

function rowLabel(row: BuildingRow, t: Translate) {
  if (row.kind === "subject") return row.name;
  return t(
    row.kind === "choosing" ? "planBuilding.choosing" : "planBuilding.lesson",
  );
}

// Done is a check, working a turning ring (a filled dot when motion is reduced), waiting an empty ring.
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
          ? "animate-spin border-accent border-t-transparent motion-reduce:animate-none motion-reduce:border-t-accent motion-reduce:bg-accent"
          : "border-line",
      )}
    />
  );
}
