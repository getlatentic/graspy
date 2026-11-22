import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
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
  const { t } = useI18n();
  const readyStats = setup.phase === "ready" ? setup.stats : null;
  useTitleFocus(readyStats !== null, setup.error !== null);
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
      {/* Mounted for good, so a reader hears the change when it comes. */}
      <p role="status" className="sr-only">
        {readyStats ? t("onboarding.ready.title") : ""}
      </p>
    </OnboardingLayout>
  );
}

/**
 * Focus goes to the screen's title when it first shows, when the plan is ready,
 * and when a retry starts: the buttons that had it are gone by then, and
 * focus must not fall to the page.
 */
function useTitleFocus(ready: boolean, failed: boolean) {
  const before = useRef<{ ready: boolean; failed: boolean } | null>(null);
  useEffect(() => {
    const last = before.current;
    before.current = { ready, failed };
    const retried = last !== null && last.failed && !failed;
    const arrived = last === null || last.ready !== ready;
    if (arrived || retried) {
      document.getElementById("page-title")?.focus({ preventScroll: true });
    }
  }, [ready, failed]);
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
