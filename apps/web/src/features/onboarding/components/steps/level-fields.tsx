import { useFormContext } from "react-hook-form";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { nameIn, type SchoolSystem } from "@/lib/education-api";
import { useI18n, type Translate } from "@/lib/i18n-context";
import { AFTER_SCHOOL, COURSE_MAX, isAfterSchool } from "@/lib/learner-level";
import { useSchoolClass } from "../../hooks/use-school-class";
import type { SelectOption } from "../../lib/select-options";
import type { DetailsSchema } from "../../schemas/onboarding-schema";
import SearchableSelect from "../searchable-select";
import { FIELD, FieldError, LABEL } from "./field-parts";

function classOptions(
  system: SchoolSystem | undefined,
  language: string,
  t: Translate,
): SelectOption[] {
  const stages = new Map(system?.stages.map((s) => [s.id, s.name]));
  const school = (system?.levels ?? []).map((level) => {
    const stage = stages.get(level.stage);
    return {
      value: level.id,
      label: nameIn(level.name, language),
      group: stage ? nameIn(stage, language) : undefined,
      keywords: [level.name.en, ...level.aliases],
    };
  });
  const afterSchool = AFTER_SCHOOL.map((level) => ({
    value: level,
    label: t(`level.${level}`),
    group: t("onboarding.profile.afterSchool"),
  }));
  return [...school, ...afterSchool];
}

export default function LevelFields() {
  const { t } = useI18n();
  const { watch, formState } = useFormContext<DetailsSchema>();
  const country = watch("country");
  const language = watch("language");
  const { systems, system, systemId, level, chooseSystem, chooseLevel } =
    useSchoolClass();
  const found = systems.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {found.length > 1 && (
        <SystemChoice
          systems={found}
          chosen={systemId}
          language={language}
          onChoose={chooseSystem}
        />
      )}

      <div>
        <SearchableSelect
          id="grade"
          label={t("onboarding.profile.gradeLabel")}
          value={level || ""}
          onChange={chooseLevel}
          options={classOptions(system, language, t)}
          placeholder={t(
            country
              ? "onboarding.profile.gradePlaceholder"
              : "onboarding.profile.gradeNeedsCountry",
          )}
          disabled={!country || systems.isPending || systems.isError}
        />
        <SystemsStatus
          loading={systems.isFetching && !systems.data}
          failed={systems.isError}
          onRetry={() => void systems.refetch()}
        />
        <FieldError message={formState.errors.level?.message} />
      </div>

      {isAfterSchool(level) && <CourseField />}
    </div>
  );
}

function SystemChoice({
  systems,
  chosen,
  language,
  onChoose,
}: {
  systems: SchoolSystem[];
  chosen: string;
  language: string;
  onChoose: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="motion-safe:animate-enter">
      <legend className="mb-3 block text-sm font-semibold text-ink">
        {t("onboarding.profile.systemLabel")}
      </legend>
      <div className="flex flex-wrap gap-2">
        {systems.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === chosen}
            onClick={() => onChoose(option.id)}
            className={cn(
              "rounded-2xl border px-4 py-2.5 text-start text-sm font-semibold text-ink transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              option.id === chosen
                ? "border-accent bg-accent-soft"
                : "border-line bg-white hover:border-accent-line",
            )}
          >
            {nameIn(option.name, language)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SystemsStatus({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {loading && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Spinner />
          {t("onboarding.profile.gradesLoading")}
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t("onboarding.profile.gradesFailed")}{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold underline"
          >
            {t("onboarding.subjects.tryAgain")}
          </button>
        </p>
      )}
    </>
  );
}

function CourseField() {
  const { t } = useI18n();
  const { register, formState } = useFormContext<DetailsSchema>();
  return (
    <div className="motion-safe:animate-enter">
      <label htmlFor="course" className={LABEL}>
        {t("onboarding.profile.courseLabel")}
      </label>
      <input
        id="course"
        {...register("course")}
        placeholder={t("onboarding.profile.coursePlaceholder")}
        maxLength={COURSE_MAX}
        className={cn(FIELD, "w-full")}
      />
      <FieldError message={formState.errors.course?.message} />
    </div>
  );
}
