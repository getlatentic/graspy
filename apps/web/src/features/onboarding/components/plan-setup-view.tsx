import { cn } from "@/lib/cn";
import type { usePlanSetup } from "../hooks/use-plan-setup";
import { ActionBar } from "./action-bar";
import CurriculumReadyView, { ContinueBar } from "./curriculum-ready-view";
import GenerationProgressView, {
  GenerationRetryButtons,
} from "./generation-progress-view";
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
    <OnboardingLayout
      resetKey={readyStats ? "ready" : "progress"}
      footer={footer(setup, readyStats !== null, onContinue)}
    >
      <div
        key={readyStats ? "ready" : "progress"}
        className={cn("motion-safe:animate-enter", readyStats && "text-center")}
      >
        {readyStats ? (
          <CurriculumReadyView
            stats={readyStats}
            subjects={setup.subjectNames}
          />
        ) : (
          <GenerationProgressView
            subjects={setup.subjectNames}
            step={setup.step}
            failed={setup.error !== null}
          />
        )}
      </div>
    </OnboardingLayout>
  );
}

/** The action that moves on stays in view, below the part that scrolls. */
function footer(
  setup: ReturnType<typeof usePlanSetup>,
  ready: boolean,
  onContinue: () => void,
) {
  if (ready) return <ContinueBar onContinue={onContinue} />;
  if (setup.error === null) return undefined;
  return (
    <ActionBar>
      <GenerationRetryButtons
        onRetry={setup.retry}
        onBack={setup.reset}
        isRetrying={setup.pending}
      />
    </ActionBar>
  );
}
