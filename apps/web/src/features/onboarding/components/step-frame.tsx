import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import type { StepKey } from "../lib/onboarding-steps";
import { ActionBar } from "./action-bar";

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
        <span className="text-sm font-semibold text-accent-strong">
          {t("onboarding.stepOf", { current: index + 1, total: count })}
        </span>
        <div className="h-3 rounded-full bg-ink/10 ring-1 ring-ink/20">
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
    <ActionBar className="flex flex-col gap-3">
      {problem && (
        <p
          role="alert"
          className="rounded-control bg-surface px-3 py-2 text-sm font-medium text-danger"
        >
          {problem}
        </p>
      )}
      <div
        className={cn(
          "flex items-center gap-3",
          onBack ? "justify-between" : "justify-end",
        )}
      >
        <StepButtons
          onBack={onBack}
          onNext={onNext}
          nextLabel={nextLabel}
          enabled={enabled}
          busy={busy}
        />
      </div>
    </ActionBar>
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
      ) : null}

      <Button
        size="lg"
        onClick={onNext}
        disabled={!enabled}
        className="min-w-0 flex-1 disabled:bg-surface/60 disabled:text-muted disabled:opacity-100 disabled:ring-1 disabled:ring-inset disabled:ring-muted/40 sm:flex-none"
      >
        {nextLabel}
        <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
      </Button>
    </>
  );
}
