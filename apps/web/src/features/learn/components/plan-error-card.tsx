import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";

interface PlanErrorCardProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

export function PlanErrorCard({
  message,
  onRetry,
  retrying,
}: PlanErrorCardProps) {
  const { t } = useI18n();
  return (
    <Card className="border-danger/30 bg-danger-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-danger">{t("plan.buildFailed")}</p>
          <p className="mt-0.5 text-sm text-ink">{message}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
        >
          {t("plan.tryAgain")}
        </Button>
      </div>
    </Card>
  );
}
