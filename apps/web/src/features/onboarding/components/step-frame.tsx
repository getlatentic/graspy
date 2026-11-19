import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";
import type { StepKey } from "../lib/onboarding-steps";

export function StepHeading({
  step,
  index,
  count,
}: {
  step: StepKey;
  index: number;
  count: number;
}) {
  const { t } = useI18n();
  const percent = Math.round(((index + 1) / count) * 100);
  return (
    <>
      <h1
        key={step}
        className="text-3xl font-semibold text-ink motion-safe:animate-enter sm:text-4xl"
      >
        {t(`onboarding.steps.${step}.title`)}
      </h1>

      <div className="mt-8 space-y-3">
        <span className="text-sm font-semibold text-accent-ink">
          {t("onboarding.stepOf", { current: index + 1, total: count })}
        </span>
        <div className="h-3 rounded-full bg-track">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </>
  );
}

export function StepFooter({
  onBack,
  onNext,
  nextLabel,
  canNext,
  busy,
  problem,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  canNext: boolean;
  busy: boolean;
  /** Why the last try stopped, beside the button that tries again. */
  problem?: string;
}) {
  const enabled = canNext && !busy;
  return (
    // Sticky on a short screen, where iOS Safari's toolbar would cover it.
    <div className="sticky bottom-0 -mx-8 mt-6 flex flex-col gap-3 bg-surface/95 px-8 py-4 backdrop-blur sm:-mx-10 sm:px-10 lg:static lg:mx-0 lg:mt-10 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <StepButtons
          onBack={onBack}
          onNext={onNext}
          nextLabel={nextLabel}
          enabled={enabled}
          busy={busy}
        />
      </div>
    </div>
  );
}

function StepButtons({
  onBack,
  onNext,
  nextLabel,
  enabled,
  busy,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  enabled: boolean;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {onBack ? (
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("onboarding.back")}
        </Button>
      ) : (
        <span className="invisible inline-flex shrink-0 px-4 py-3 sm:px-6" />
      )}

      <Button
        size="lg"
        onClick={onNext}
        disabled={!enabled}
        className="min-w-0 flex-1 sm:flex-none"
      >
        {nextLabel}
        <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
      </Button>
    </>
  );
}
