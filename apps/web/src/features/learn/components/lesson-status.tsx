import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";
import type { LessonProblem } from "@/features/learn/lib/lesson-problem";

interface LessonProblemCardProps {
  problem: LessonProblem;
  onRetry: () => void;
  onBack: () => void;
}

export function LessonProblemCard({
  problem,
  onRetry,
  onBack,
}: LessonProblemCardProps) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="rounded-card border border-line bg-surface p-6 motion-safe:animate-enter"
    >
      <h2 className="text-lg font-semibold text-ink">
        {t("lesson.loadFailed")}
      </h2>
      {problem.key && (
        <p className="mt-2 leading-7 text-muted">{t(problem.key)}</p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {problem.retryable && (
          <Button onClick={onRetry}>{t("lesson.tryAgain")}</Button>
        )}
        <Button variant="secondary" onClick={onBack}>
          {t("lesson.backToTopics")}
        </Button>
      </div>
    </div>
  );
}

export function LessonLoading({ topic }: { topic: string | undefined }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-10 text-center motion-safe:animate-enter"
    >
      <Spinner />
      <h2 className="text-lg font-semibold text-ink">{t("lesson.loading")}</h2>
      <p className="text-muted">{topic}</p>
    </div>
  );
}
