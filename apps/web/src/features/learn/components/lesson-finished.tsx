import { ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";

interface LessonFinishedProps {
  topic: string;
  subject: string;
  objectives: string[];
  /** Null when every topic is learnt. */
  next: string | null;
  onNext: () => void;
  onBack: () => void;
}

export function LessonFinished({
  topic,
  subject,
  objectives,
  next,
  onNext,
  onBack,
}: LessonFinishedProps) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="lesson-finished"
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6 motion-safe:animate-enter sm:p-8"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 size-6 shrink-0 text-success"
          aria-hidden="true"
        />
        <div>
          <h2
            id="lesson-finished"
            dir="auto"
            className="text-balance text-xl font-semibold text-ink"
          >
            {t("lesson.finished.title", { topic })}
          </h2>
          {!next && (
            <p className="mt-1 text-muted">
              {t("lesson.finished.allDone", { subject })}
            </p>
          )}
        </div>
      </div>
      {objectives.length > 0 && <Objectives objectives={objectives} />}
      {next && <UpNext topic={next} />}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant={next ? "secondary" : "primary"} onClick={onBack}>
          {t("lesson.backTo", { subject })}
        </Button>
        {next && (
          <Button onClick={onNext}>
            {t("lesson.finished.start")}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        )}
      </div>
    </section>
  );
}

function Objectives({ objectives }: { objectives: string[] }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-sm font-semibold text-ink">
        {t("lesson.finished.canNow")}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {objectives.map((objective) => (
          <li key={objective} className="flex items-start gap-2 text-muted">
            <Check
              className="mt-1 size-4 shrink-0 text-success"
              aria-hidden="true"
            />
            <span dir="auto">{objective}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UpNext({ topic }: { topic: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-card bg-accent-soft p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
        {t("lesson.finished.upNext")}
      </p>
      <p dir="auto" className="mt-1 font-semibold text-ink">
        {topic}
      </p>
    </div>
  );
}
