import { CheckCircle, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import type { GenerationStats } from "../lib/generate-plan";
import SubjectChips from "./subject-chips";

export default function CurriculumReadyView({
  stats,
  subjects,
  onContinue,
}: {
  stats: GenerationStats;
  subjects: string[];
  onContinue: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft">
        <CheckCircle className="h-14 w-14 text-accent-ink" />
      </div>
      <h2 className="text-balance text-4xl font-bold text-ink">
        {t("onboarding.ready.title")}
      </h2>
      <p className="mt-4 text-base text-muted">
        {t("onboarding.ready.body", { topics: stats.topicCount })}
      </p>

      <div className="mt-6">
        <SubjectChips subjects={subjects} />
      </div>

      {/* Sticky on a short screen, where iOS Safari's toolbar would cover it. */}
      <div className="sticky bottom-0 -mx-6 mt-6 bg-white px-6 py-4 sm:static sm:mx-0 sm:mt-10 sm:p-0">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 text-lg font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("onboarding.ready.continue")}
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
