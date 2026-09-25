import { cn } from "@/lib/cn";
import type { usePlanSetup } from "../hooks/use-plan-setup";
import CurriculumReadyView from "./curriculum-ready-view";
import GenerationProgressView from "./generation-progress-view";
import OnboardingFrame from "./onboarding-frame";

export default function PlanSetupView({
  setup,
  onContinue,
}: {
  setup: ReturnType<typeof usePlanSetup>;
  onContinue: () => void;
}) {
  const readyStats = setup.phase === "ready" ? setup.stats : null;
  return (
    <OnboardingFrame>
      <div className="flex flex-1 items-center justify-center py-8 sm:py-16">
        <div
          key={readyStats ? "ready" : "progress"}
          className={cn(
            "w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl motion-safe:animate-enter sm:p-10",
            readyStats && "text-center",
          )}
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
      </div>
    </OnboardingFrame>
  );
}
