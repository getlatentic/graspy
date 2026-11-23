import { artSizes } from "@/components/brand/art-urls";
import type { CurriculumSource } from "@/lib/curriculum-record";
import { BackLink } from "@/components/ui/back-link";
import { useI18n } from "@/lib/i18n-context";
import { SubjectPicture } from "@/features/learn/components/subject-picture";

// size-14, and size-16 from sm.
const PICTURE_SIZES = artSizes([{ rem: 3.5 }, { from: 40, rem: 4 }]);

interface SubjectHeaderProps {
  name: string;
  /** The official curriculum the topics follow; none where a model planned them. */
  source?: CurriculumSource;
  /** The subject is in the learner's plan and has no official curriculum behind it. */
  modelWritten?: boolean;
  onBack: () => void;
}

export function SubjectHeader({
  name,
  source,
  modelWritten = false,
  onBack,
}: SubjectHeaderProps) {
  const { t } = useI18n();
  return (
    <header>
      <BackLink onClick={onBack}>{t("subject.back")}</BackLink>
      <div className="mt-4 flex items-center gap-3">
        <SubjectPicture
          name={name}
          frame="small"
          sizes={PICTURE_SIZES}
          className="size-14 sm:size-16"
          iconClassName="size-7 sm:size-8"
        />
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-semibold text-ink sm:text-3xl">
            {name}
          </h1>
          {source && (
            <p className="mt-1 text-sm text-muted">
              {t("subject.curriculum", {
                authority: source.authority,
                edition: source.edition,
              })}
            </p>
          )}
          {!source && modelWritten && (
            <p className="mt-1 text-sm text-muted">
              {t("subject.modelWritten")}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

export function SubjectProgress({
  learnt,
  total,
}: {
  learnt: number;
  total: number;
}) {
  const { t } = useI18n();
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">
          {t("subject.progressLabel")}
        </span>
        <span className="nums text-muted">
          {t("subject.progress", { done: learnt, total })}
        </span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-track">
        <div
          className="h-2 rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${(learnt / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
