import { cn } from "@/lib/cn";
import type { usePlanSetup } from "../hooks/use-plan-setup";
import CurriculumReadyView from "./curriculum-ready-view";
import GenerationProgressView from "./generation-progress-view";
import OnboardingLayout from "./onboarding-layout";

export default function PlanSetupView({
  setup,
  onContinue,
}: {
  setup: ReturnType<typeof usePlanSetup>;
  onContinue: () => void;
}) {
  const readyStats = setup.phase === "ready" ? setup.stats : null;
  return (
    <OnboardingLayout>
      <div
        key={readyStats ? "ready" : "progress"}
        className={cn("motion-safe:animate-enter", readyStats && "text-center")}
      >
        {readyStats ? (
          <CurriculumReadyView
            stats={readyStats}
            subjects={setup.subjectNames}
            onContinue={onContinue}
          />
        ) : (
          <GenerationProgressView
            subjects={setup.subjectNames}
            step={setup.step}
            error={setup.error}
            onRetry={setup.retry}
            onBack={setup.reset}
            isRetrying={setup.pending}
          />
        )}
      </div>
    </OnboardingLayout>
  );
}
