import { useEffect, useState } from "react";
import { PencilLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAccount } from "@/lib/account/use-account";
import { ProgressBar } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n-context";
import {
  keptRecord,
  learnerRecord,
  tally,
  type RecordedAnswer,
} from "@/lib/learner-record";
import { usePlan } from "../learner-context";

export function PracticeRecordCard() {
  const { t } = useI18n();
  const { curriculum } = usePlan();
  const records = usePracticeAnswers();
  if (!records) return null;
  const { total, bySubject } = tally(records);
  const subjects = (curriculum?.subjects ?? []).flatMap((subject) => {
    const counts = bySubject.get(subject.slug);
    return counts ? [{ name: subject.name, ...counts }] : [];
  });

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <PencilLine className="size-4 text-accent-ink" aria-hidden="true" />
        {t("you.practice")}
      </h2>
      {total.answered === 0 ? (
        <p className="text-sm text-muted">{t("you.practiceNone")}</p>
      ) : (
        <>
          <p className="nums font-display text-2xl font-semibold text-accent-ink">
            {t("you.practiceRight", { ...total })}
          </p>
          <SubjectPractice subjects={subjects} />
        </>
      )}
    </Card>
  );
}

function usePracticeAnswers(): RecordedAnswer[] | null {
  const { curriculum, isLoaded } = usePlan();
  // Before the saved plan loads, the plan is a placeholder with no record.
  const planId = isLoaded ? curriculum?.planId : undefined;
  const reader = useAccount()?.uid;
  const [records, setRecords] = useState<RecordedAnswer[] | null>(() =>
    planId ? (keptRecord(planId)?.answers ?? null) : null,
  );

  useEffect(() => {
    if (!planId) return;
    // The kept record shows at once so the card does not pop in late.
    const kept = keptRecord(planId);
    if (kept) setRecords(kept.answers);
    let current = true;
    learnerRecord(planId)
      .then((found) => current && setRecords(found.answers))
      .catch((error) => console.error("Reading practice failed:", error));
    return () => {
      current = false;
    };
  }, [planId, reader]);

  return records;
}

function SubjectPractice({
  subjects,
}: {
  subjects: { name: string; right: number; answered: number }[];
}) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-3">
      {subjects.map((subject) => (
        <li key={subject.name} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-ink">{subject.name}</span>
            <span className="nums text-muted">
              {t("you.practiceRight", { ...subject })}
            </span>
          </div>
          <ProgressBar
            percent={(subject.right / subject.answered) * 100}
            label={t("you.practiceRight", { ...subject })}
          />
        </li>
      ))}
    </ul>
  );
}
