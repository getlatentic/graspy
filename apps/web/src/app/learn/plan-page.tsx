import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { usePlanEditor } from "@/features/learn/hooks/use-plan-editor";
import { PlanSubjects } from "@/features/learn/components/plan-subjects";
import { RebuildPlanCard } from "@/features/learn/components/rebuild-plan-card";
import { usePlan } from "@/features/learn/learner-context";

export default function PlanPage() {
  const { t } = useI18n();
  const { isGenerating, isLoaded } = usePlan();
  const editor = usePlanEditor();
  // Until the saved plan is read, the plan is a placeholder with no subjects.
  const busy = !isLoaded || editor.saving || isGenerating;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <Link
          to="/app/learn/subjects"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("plan.back")}
        </Link>
        <h1 className="mt-4 text-balance text-2xl font-semibold text-ink">
          {t("plan.title")}
        </h1>
      </div>

      {isGenerating && (
        <Card className="flex items-center gap-3 text-sm text-ink">
          <Spinner className="text-accent-ink" />
          {t("plan.busy")}
        </Card>
      )}

      <PlanSubjects editor={editor} busy={busy} />
      <RebuildPlanCard busy={busy} onRebuild={editor.rebuild} />
    </div>
  );
}
