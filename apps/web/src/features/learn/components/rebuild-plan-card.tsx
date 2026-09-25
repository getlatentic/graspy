import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n-context";

export function RebuildPlanCard({
  busy,
  onRebuild,
}: {
  busy: boolean;
  onRebuild: () => Promise<void>;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const startAgain = () => {
    void onRebuild();
    navigate("/app/learn");
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold text-ink">{t("plan.rebuildTitle")}</h2>
      <p className="text-pretty text-sm text-muted">{t("plan.rebuildBody")}</p>
      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={startAgain} disabled={busy}>
            {t("plan.rebuildConfirm")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            {t("plan.cancel")}
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="self-start"
        >
          {t("plan.rebuild")}
        </Button>
      )}
    </Card>
  );
}
