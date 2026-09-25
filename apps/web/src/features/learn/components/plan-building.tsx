import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { CurriculumSetupCard } from "@/features/learn/components/curriculum-setup-card";
import { usePlan } from "../learner-context";

export function PlanBuilding() {
  const { t } = useI18n();
  const { curriculum, isGenerating, isPrimingLesson, nextSubject } = usePlan();
  const step = isPrimingLesson
    ? "preparingFirstLesson"
    : "generatingCurriculum";

  return (
    <>
      <CurriculumSetupCard
        curriculum={curriculum}
        isGenerating={isGenerating}
        nextSubject={nextSubject}
      />
      <Card className="flex items-center gap-3">
        <Spinner className="size-5 text-accent-ink" />
        <div>
          <p className="text-sm font-semibold text-ink">
            {t(`planBuilding.${step}`)}
          </p>
          <p className="text-sm text-muted">
            {t(`planBuilding.${step}Description`)}
          </p>
        </div>
      </Card>
    </>
  );
}
