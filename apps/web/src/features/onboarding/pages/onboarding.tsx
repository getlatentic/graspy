import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { FormProvider } from "react-hook-form";
import { ServiceConsentGate } from "@/features/account/components/service-consent-gate";
import { useI18n } from "@/lib/i18n-context";
import { detectLocale } from "@/lib/locale-detector";
import { hasCompletedOnboarding } from "@/lib/user-storage";
import OnboardingLayout from "../components/onboarding-layout";
import PlanSetupView from "../components/plan-setup-view";
import { StepFooter, StepHeading } from "../components/step-frame";
import ProfileStep from "../components/steps/profile-step";
import SubjectsStep from "../components/steps/subjects-step";
import { useOnboardingForm } from "../hooks/use-onboarding-form";
import { useOnboardingSteps } from "../hooks/use-onboarding-steps";
import { usePlanSetup } from "../hooks/use-plan-setup";
import { nextLabelKey, notKeptAtOnce } from "../lib/onboarding-steps";
import type { DetailsSchema } from "../schemas/onboarding-schema";

type Replan = { replan?: DetailsSchema } | null;

export default function OnboardingPage() {
  const replan = (useLocation().state as Replan)?.replan;
  // Checked once: the plan made here completes onboarding before the
  // learner has opened it.
  const [onboarded] = useState(() => !replan && hasCompletedOnboarding());
  if (onboarded) return <Navigate to="/app/learn" />;
  return (
    <ServiceConsentGate>
      <Onboarding replan={replan} />
    </ServiceConsentGate>
  );
}

function Onboarding({ replan }: { replan?: DetailsSchema }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [detected] = useState(detectLocale);
  const form = useOnboardingForm(replan, detected);
  const setup = usePlanSetup();
  const steps = useOnboardingSteps(form, replan, (data, subjects) => {
    void setup.start(data, subjects);
  });

  if (setup.phase === "kept") return <Navigate to="/app/learn" replace />;
  if (setup.phase !== "form") {
    return (
      <PlanSetupView setup={setup} onContinue={() => navigate("/app/learn")} />
    );
  }
  const notKept = notKeptAtOnce(setup.error !== null, form.watch());

  return (
    <OnboardingLayout>
      <StepHeading step={steps.step} index={steps.index} count={steps.count} />
      <div
        key={steps.step}
        className={`mt-8 flex-1 min-h-0 motion-safe:animate-enter lg:pe-1 ${
          steps.step === "subjects" ? "" : "lg:overflow-y-auto"
        }`}
      >
        <FormProvider {...form}>
          {steps.step === "profile" ? (
            <ProfileStep suggestedCountry={detected.country ?? undefined} />
          ) : (
            <SubjectsStep subjects={steps.subjects} />
          )}
        </FormProvider>
      </div>
      <StepFooter
        onBack={steps.index > 0 ? steps.back : undefined}
        onNext={() => void steps.next()}
        nextLabel={t(nextLabelKey(setup.busy, steps.isLast, notKept))}
        canNext={steps.canNext}
        busy={setup.busy}
        problem={notKept ? t("onboarding.generating.failed") : undefined}
      />
    </OnboardingLayout>
  );
}
