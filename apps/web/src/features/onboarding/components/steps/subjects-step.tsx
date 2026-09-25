import { Check } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useI18n } from "@/lib/i18n-context";
import { SUBJECT_SELECTION_LIMIT } from "../../constants";
import { toggledSelection } from "../../lib/subject-selection";
import type { OnboardingSchema } from "../../schemas/onboarding-schema";
import type { GeneratedSubject } from "../../types";
import type { useSubjectChoices } from "../../hooks/use-subject-choices";

export default function SubjectsStep({
  subjects,
}: {
  subjects: ReturnType<typeof useSubjectChoices>;
}) {
  const { available, loading, error } = subjects;
  const { watch, setValue } = useFormContext<OnboardingSchema>();
  const selected = watch("selectedSubjects") || [];

  const toggle = (id: string) => {
    const next = toggledSelection(selected, id);
    if (next !== selected) {
      setValue("selectedSubjects", next, { shouldValidate: true });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
      <SubjectsNotices chosen={selected.length} loading={loading} />
      <div className="relative flex-1 min-h-0 rounded-2xl border border-line bg-white/90">
        {!loading && !error && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-6 rounded-t-2xl bg-surface" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-surface" />
          </>
        )}
        <div className="absolute inset-0 overflow-y-auto px-2 py-3">
          <SubjectsBody
            failed={Boolean(error)}
            loading={loading}
            subjects={available}
            selected={selected}
            onToggle={toggle}
            onRetry={subjects.refetch}
          />
        </div>
      </div>

      <div className="h-0" aria-hidden />
    </div>
  );
}

function SubjectsNotices({
  chosen,
  loading,
}: {
  chosen: number;
  loading: boolean;
}) {
  const { t } = useI18n();
  const { formState } = useFormContext<OnboardingSchema>();
  const error = formState.errors.selectedSubjects;
  return (
    <>
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{t("onboarding.subjects.heading")}</span>
        <span className="rounded-full border border-line bg-accent-soft px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-accent-ink">
          {t("onboarding.subjects.scroll")}
        </span>
      </div>
      {chosen >= SUBJECT_SELECTION_LIMIT && (
        <div className="rounded-lg border border-line bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-ink">
          {t("onboarding.subjects.limit", { limit: SUBJECT_SELECTION_LIMIT })}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {t(error.message ?? "onboarding.errors.subjects")}
        </div>
      )}
      {loading && (
        <p
          role="status"
          className="rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-xs font-medium text-accent-ink"
        >
          {t("onboarding.subjects.finding")}
        </p>
      )}
    </>
  );
}

function SubjectsBody({
  failed,
  loading,
  subjects,
  selected,
  onToggle,
  onRetry,
}: {
  failed: boolean;
  loading: boolean;
  subjects: GeneratedSubject[];
  selected: string[];
  onToggle: (id: string) => void;
  onRetry: () => void;
}) {
  if (failed) return <SubjectsFailed onRetry={onRetry} />;
  if (loading) return <SubjectsSkeleton />;
  return (
    <div className="space-y-1.5 pe-1">
      {subjects.map((subject, index) => (
        <SubjectButton
          key={subject.id}
          place={index}
          subject={subject}
          chosen={selected.includes(subject.id)}
          onToggle={() => onToggle(subject.id)}
        />
      ))}
    </div>
  );
}

function SubjectsFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-muted">
        {t("onboarding.subjects.loadFailed")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-accent bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink transition"
      >
        {t("onboarding.subjects.tryAgain")}
      </button>
    </div>
  );
}

function SubjectsSkeleton() {
  return (
    <div className="space-y-2 pe-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={`subject-skeleton-${index}`}
          className="h-11 rounded-lg border border-line bg-track/70 animate-pulse"
        />
      ))}
    </div>
  );
}

// Subjects arrive together; staggering shows each one entering.
const STAGGER_MS = 40;
const MAX_STAGGERED = 10;

function SubjectButton({
  place,
  subject,
  chosen,
  onToggle,
}: {
  place: number;
  subject: GeneratedSubject;
  chosen: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onToggle}
      style={{
        animationDelay: `${Math.min(place, MAX_STAGGERED) * STAGGER_MS}ms`,
      }}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-start transition motion-safe:animate-enter ${
        chosen
          ? "border-accent bg-accent-soft text-ink"
          : "border-line bg-white hover:border-accent hover:bg-raised"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`text-sm font-semibold ${chosen ? "text-accent-ink" : "text-ink"}`}
        >
          {subject.label}
        </span>
        {subject.recommended && (
          <span className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
            {t("onboarding.subjects.recommended")}
          </span>
        )}
      </div>
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
          chosen
            ? "border-accent bg-accent text-white"
            : "border-line text-muted"
        }`}
      >
        {chosen ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
      </span>
    </button>
  );
}
