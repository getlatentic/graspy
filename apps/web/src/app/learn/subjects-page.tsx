import { Link, useNavigate } from "react-router";
import { Pencil } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { useSubjectRows } from "@/features/learn/hooks/use-subject-rows";
import { SubjectList } from "@/features/learn/components/subject-list";
import { subjectPath } from "@/lib/learn-paths";
import { usePlan } from "@/features/learn/learner-context";

export default function SubjectsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { curriculum } = usePlan();
  const rows = useSubjectRows(curriculum);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {t("nav.subjects")}
        </h1>
        <Link
          to="/app/learn/plan"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {t("plan.edit")}
        </Link>
      </div>
      {rows.length > 0 ? (
        <SubjectList
          rows={rows}
          progressLabel={(completed, total) =>
            t("subject.lessonsCompleted", { completed, total })
          }
          onSelect={(subject) => navigate(subjectPath(subject.slug))}
        />
      ) : (
        <p className="text-muted">{t("home.noSubjects")}</p>
      )}
    </div>
  );
}
