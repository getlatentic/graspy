import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { useI18n, type Translate } from "@/lib/i18n-context";
import {
  setupSteps,
  type SetupHint,
  type SetupState,
  type SetupStep,
} from "@/features/learn/lib/setup-steps";
import {
  topicsOf,
  type CurriculumData,
  type CurriculumSubject,
} from "@/lib/curriculum-record";

interface CurriculumSetupCardProps {
  curriculum: CurriculumData | null;
  isGenerating: boolean;
  nextSubject: CurriculumSubject | null;
}

const STATE_STYLES: Record<
  SetupState,
  {
    indicator: string;
    title: string;
    chip?: { className: string; label: "complete" | "inProgress" };
  }
> = {
  complete: {
    indicator: "bg-accent text-white border-accent",
    title: "text-ink",
    chip: { className: "bg-accent-soft text-accent-ink", label: "complete" },
  },
  active: {
    indicator: "border-2 border-accent text-accent-ink",
    title: "text-accent-ink",
    chip: { className: "bg-accent text-white", label: "inProgress" },
  },
  pending: {
    indicator: "border border-line text-muted",
    title: "text-muted",
  },
};

function stepText(key: SetupStep["key"], t: Translate) {
  const text = {
    generate: [
      t("planBuilding.generate"),
      t("planBuilding.generateDescription"),
    ],
    path: [t("planBuilding.path"), t("planBuilding.pathDescription")],
    session: [t("planBuilding.session"), t("planBuilding.sessionDescription")],
  } as const;
  const [title, description] = text[key];
  return { title, description };
}

function hintText(hint: SetupHint, subjectCount: number, t: Translate) {
  const text: Record<SetupHint, string> = {
    subjectsReady: t("planBuilding.subjectsReady", { count: subjectCount }),
    lessonReady: t("planBuilding.lessonReady"),
    startLesson: t("planBuilding.startLesson"),
    lessonInProgress: t("planBuilding.lessonInProgress"),
  };
  return text[hint];
}

interface SubjectEntry {
  subject: CurriculumSubject;
  topics: string[];
}

export function CurriculumSetupCard({
  curriculum,
  isGenerating,
  nextSubject,
}: CurriculumSetupCardProps) {
  const { t } = useI18n();
  const subjectEntries = useMemo(
    () =>
      (curriculum?.subjects ?? []).map((subject) => ({
        subject,
        topics: topicsOf(curriculum, subject.slug),
      })),
    [curriculum],
  );
  const steps = setupSteps({
    isGenerating,
    subjectCount: subjectEntries.length,
    session: curriculum?.activeSession,
    hasNextSubject: nextSubject !== null,
  });

  return (
    <div className="bg-white border border-line rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {t("planBuilding.title")}
          </h2>
          <p className="text-sm text-muted">{t("planBuilding.subtitle")}</p>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <SetupStepRow
            key={step.key}
            step={step}
            number={index + 1}
            hint={step.hint && hintText(step.hint, subjectEntries.length, t)}
            subjects={step.key === "generate" ? subjectEntries : []}
          />
        ))}
      </div>
    </div>
  );
}

interface SetupStepRowProps {
  step: SetupStep;
  number: number;
  hint: string | null;
  subjects: SubjectEntry[];
}

function SetupStepRow({ step, number, hint, subjects }: SetupStepRowProps) {
  const { t } = useI18n();
  const styles = STATE_STYLES[step.state];
  const { title, description } = stepText(step.key, t);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-track p-3">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${styles.indicator}`}
      >
        {number}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-semibold ${styles.title}`}>{title}</h3>
          {styles.chip && (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles.chip.className}`}
            >
              {t(`planBuilding.${styles.chip.label}`)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted mt-1 leading-snug">{description}</p>
        {hint && (
          <p className="mt-2 w-fit rounded-md bg-accent-soft px-2.5 py-1 text-xs text-accent-ink">
            {hint}
          </p>
        )}
        {subjects.length > 0 && (
          <div className="mt-3 space-y-2">
            {subjects.map((entry) => (
              <SubjectTopics key={entry.subject.slug} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectTopics({ entry }: { entry: SubjectEntry }) {
  const { t } = useI18n();
  return (
    <details className="group rounded-lg border border-accent-line bg-accent-soft/70 px-3 py-2">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium text-ink marker:content-none select-none">
        <span className="truncate">{entry.subject.name}</span>
        <span className="flex items-center gap-2 text-xs text-accent-ink">
          {t("planBuilding.topicsCount", { count: entry.topics.length })}
          <ChevronDown
            className="h-4 w-4 text-accent-ink transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      {entry.topics.length > 0 && (
        <ul className="mt-2 space-y-1 border-l border-line pl-3 text-xs text-ink">
          {entry.topics.map((topic, idx) => (
            <li
              key={`${entry.subject.slug}-topic-${idx}`}
              className="leading-relaxed"
            >
              {topic}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
