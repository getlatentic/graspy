import { CheckCircle, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import type { GenerationStats } from "../lib/generate-plan";
import { ActionBar } from "./action-bar";
import SubjectChips from "./subject-chips";

export default function CurriculumReadyView({
  stats,
  subjects,
}: {
  stats: GenerationStats;
  subjects: string[];
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft">
        <CheckCircle className="h-14 w-14 text-accent-ink" />
      </div>
      <h1
        id="page-title"
        tabIndex={-1}
        className="text-balance text-4xl font-semibold text-ink outline-none"
      >
        {t("onboarding.ready.title")}
      </h1>
      <p className="mt-4 text-base text-ink">
        {t("onboarding.ready.body", { topics: stats.topicCount })}
      </p>

      <div className="mt-6">
        <SubjectChips subjects={subjects} />
      </div>
    </>
  );
}

export function ContinueBar({ onContinue }: { onContinue: () => void }) {
  const { t } = useI18n();
  return (
    <ActionBar>
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-accent px-6 py-4 text-lg font-semibold text-on-accent transition"
      >
        {t("onboarding.ready.continue")}
        <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
      </button>
    </ActionBar>
  );
}
