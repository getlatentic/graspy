import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { SubjectBadge } from "@/features/learn/components/subject-icon";

interface SubjectHeaderProps {
  name: string;
  onBack: () => void;
}

export function SubjectHeader({ name, onBack }: SubjectHeaderProps) {
  const { t } = useI18n();
  return (
    <header>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t("subject.back")}
      </button>
      <div className="mt-4 flex items-center gap-3">
        <SubjectBadge name={name} className="size-11 rounded-full" />
        <h1 className="text-balance text-2xl font-semibold text-ink sm:text-3xl">
          {name}
        </h1>
      </div>
      <p className="mt-3 text-muted">{t("subject.chooseTopic")}</p>
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
