import { ChevronLeft, ChevronRight } from "lucide-react";
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
        className="text-3xl font-bold text-ink motion-safe:animate-enter sm:text-4xl"
      >
        {t(`onboarding.steps.${step}.title`)}
      </h1>

      <div className="mt-8 space-y-3">
        <span className="text-sm font-semibold text-accent-ink">
          {t("onboarding.stepOf", { current: index + 1, total: count })}
        </span>
        <div className="h-2 rounded-full bg-accent-soft">
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
    <div className="sticky bottom-0 -mx-8 mt-6 flex flex-col gap-3 bg-white/95 px-8 py-4 backdrop-blur sm:-mx-10 sm:px-10 lg:static lg:mx-0 lg:mt-10 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
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
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-base sm:px-6 font-semibold text-muted transition hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:bg-track disabled:text-line"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("onboarding.back")}
        </button>
      ) : (
        <span className="invisible inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 sm:px-6" />
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!enabled}
        className={`inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-4 text-lg font-semibold transition sm:flex-none sm:px-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
          enabled
            ? "bg-accent text-white"
            : "cursor-not-allowed bg-line text-muted"
        }`}
      >
        {nextLabel}
        <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
      </button>
    </>
  );
}
