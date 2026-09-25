import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import { getUserProfile } from "@/lib/user-storage";
import { SUBJECT_SELECTION_LIMIT } from "@/features/onboarding/constants";
import { useSubjects } from "@/features/onboarding/hooks/use-subjects";
import { SubjectChecklist } from "@/features/learn/components/subject-checklist";
import type { PlanEditor } from "@/features/learn/hooks/use-plan-editor";
import { usePlan } from "../learner-context";

const sameSubjects = (a: string[], b: string[]) =>
  a.length === b.length && a.every((name) => b.includes(name));

export function PlanSubjects({
  editor,
  busy,
}: {
  editor: PlanEditor;
  busy: boolean;
}) {
  const { t } = useI18n();
  const { curriculum } = usePlan();
  const current = useMemo(
    () => curriculum?.subjects.map((subject) => subject.name) ?? [],
    [curriculum],
  );
  const { names, loading } = useSubjectNames(current);
  const { chosen, toggle } = useChosen(current);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>{t("plan.subjectsLabel")}</SectionLabel>
        <span className="nums text-xs text-muted">
          {t("plan.chosen", {
            count: chosen.length,
            limit: SUBJECT_SELECTION_LIMIT,
          })}
        </span>
      </div>
      <SubjectChecklist
        names={names}
        chosen={chosen}
        limit={SUBJECT_SELECTION_LIMIT}
        disabled={busy}
        onToggle={toggle}
      />
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner />
          {t("plan.findingMore")}
        </p>
      )}
      <SaveSubjects
        editor={editor}
        chosen={chosen}
        disabled={busy || sameSubjects(chosen, current) || chosen.length === 0}
      />
    </section>
  );
}

function useChosen(current: string[]) {
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = picked ?? current;
  const toggle = (name: string) =>
    setPicked(
      chosen.includes(name)
        ? chosen.filter((item) => item !== name)
        : [...chosen, name],
    );
  return { chosen, toggle };
}

interface SaveSubjectsProps {
  editor: PlanEditor;
  chosen: string[];
  disabled: boolean;
}

function SaveSubjects({ editor, chosen, disabled }: SaveSubjectsProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const save = async () => {
    if (await editor.saveSubjects(chosen)) navigate("/app/learn");
  };
  return (
    <>
      <p className="text-sm text-muted">{t("plan.saveNote")}</p>
      {editor.failed && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("plan.failed")}
        </p>
      )}
      <Button onClick={save} disabled={disabled} className="self-start">
        {editor.saving && <Spinner />}
        {editor.saving ? t("plan.saving") : t("plan.save")}
      </Button>
    </>
  );
}

function useSubjectNames(current: string[]) {
  const { subjectsState, isSubjectsQueryLoading, fetchSubjects } =
    useSubjects();

  useEffect(() => {
    const profile = getUserProfile();
    if (!profile) return;
    fetchSubjects({
      country: profile.country,
      language: profile.language,
      gradeLevel: profile.gradeLevel,
    });
  }, [fetchSubjects]);

  const names = useMemo(
    () => [
      ...new Set([
        ...current,
        ...subjectsState.subjects.map((subject) => subject.label),
      ]),
    ],
    [current, subjectsState.subjects],
  );
  return { names, loading: isSubjectsQueryLoading };
}
