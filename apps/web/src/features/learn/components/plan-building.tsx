import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";

export function PlanBuilding() {
  const { t } = useI18n();
  return (
    <Card className="flex items-center gap-3">
      <Spinner className="size-5 text-accent-ink" />
      <p className="text-sm font-semibold text-ink">
        {t("planBuilding.making")}
      </p>
    </Card>
  );
}
