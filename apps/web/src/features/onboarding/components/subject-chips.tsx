import { useI18n } from "@/lib/i18n-context";

// More chips would push the progress off a phone's screen.
const VISIBLE_SUBJECTS = 3;

export default function SubjectChips({ subjects }: { subjects: string[] }) {
  const { t } = useI18n();
  if (subjects.length === 0) return null;

  const shown = subjects.slice(0, VISIBLE_SUBJECTS);
  const hidden = subjects.slice(VISIBLE_SUBJECTS);
  const chip =
    "max-w-full truncate rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink";

  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {shown.map((subject) => (
        <li key={subject} className={chip} title={subject}>
          {subject}
        </li>
      ))}
      {hidden.length > 0 && (
        <li className={chip} title={hidden.join(", ")}>
          {t("onboarding.moreSubjects", { count: hidden.length })}
        </li>
      )}
    </ul>
  );
}
