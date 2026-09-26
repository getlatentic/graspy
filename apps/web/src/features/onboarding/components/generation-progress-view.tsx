import type { ReactNode } from "react";
import { CheckCircle, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import {
  GENERATION_STEP_SEQUENCE,
  type GenerationTimelineStep,
} from "../lib/plan-setup-state";
import SubjectChips from "./subject-chips";

type Standing = "done" | "current" | "ahead";

const STANDING: Record<
  Standing,
  { box: string; icon: ReactNode; label: string }
> = {
  done: {
    box: "border-accent-line bg-accent-soft",
    icon: <CheckCircle className="h-5 w-5 text-accent-ink" />,
    label: "text-accent-ink",
  },
  current: {
    box: "border-accent bg-accent-soft",
    icon: (
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    ),
    label: "text-ink",
  },
  ahead: {
    box: "border-line bg-raised",
    icon: <div className="h-5 w-5 rounded-full border-2 border-line" />,
    label: "text-ink",
  },
};

function TimelineStage({
  stage,
  standing,
}: {
  stage: GenerationTimelineStep;
  standing: Standing;
}) {
  const { t } = useI18n();
  const look = STANDING[standing];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all sm:p-4 ${look.box}`}
    >
      {look.icon}
      <p className={`font-semibold ${look.label}`}>
        {t(`onboarding.generating.stages.${stage}.label`)}
      </p>
    </div>
  );
}

function GenerationFailed({
  onRetry,
  onBack,
  isRetrying,
}: {
  onRetry: () => void;
  onBack: () => void;
  isRetrying: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-10 space-y-4 rounded-2xl border border-danger/30 bg-danger-soft p-5 text-danger">
      <p className="font-semibold">{t("onboarding.generating.failed")}</p>
      <p className="text-sm text-danger">
        {t("onboarding.generating.failedBody")}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-danger px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed"
        >
          {t("onboarding.generating.tryAgain")}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-danger/30 bg-white px-6 py-3 text-sm font-semibold text-danger transition hover:border-danger"
        >
          {t("onboarding.generating.adjust")}
        </button>
      </div>
    </div>
  );
}

export default function GenerationProgressView({
  subjects,
  step,
  error,
  onRetry,
  onBack,
  isRetrying,
}: {
  subjects: string[];
  step: GenerationTimelineStep;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  isRetrying: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-6 text-center sm:mb-10">
        <h2 className="text-balance text-2xl font-bold text-ink sm:text-3xl">
          {t("onboarding.generating.title")}
        </h2>
      </div>

      <div className="mb-8">
        <SubjectChips subjects={subjects} />
      </div>

      <Timeline step={step} />

      <p className="mt-6 flex items-center gap-2 rounded-xl sm:mt-10 border border-accent-line bg-accent-soft px-4 py-3 text-sm text-accent-ink">
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        {t("onboarding.generating.wait")}
      </p>

      {error && (
        <GenerationFailed
          onRetry={onRetry}
          onBack={onBack}
          isRetrying={isRetrying}
        />
      )}
    </>
  );
}

function Timeline({ step }: { step: GenerationTimelineStep }) {
  const { t } = useI18n();
  const stepIndex = GENERATION_STEP_SEQUENCE.indexOf(step);
  const percent = Math.round(
    ((stepIndex + 1) / GENERATION_STEP_SEQUENCE.length) * 100,
  );
  const standing = (index: number): Standing => {
    if (index < stepIndex) return "done";
    return index === stepIndex ? "current" : "ahead";
  };
  return (
    <>
      <div className="mb-8">
        <div className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full w-full rounded-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-center text-sm font-semibold text-muted">
          {t("onboarding.generating.percent", { percent })}
        </p>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {GENERATION_STEP_SEQUENCE.map((stage, index) => (
          <TimelineStage key={stage} stage={stage} standing={standing(index)} />
        ))}
      </div>
    </>
  );
}
