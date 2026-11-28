import { useI18n } from "@/lib/i18n-context";
import type { WelcomeChip } from "@/features/learn/lib/welcome-chips";

/** What can be asked of an empty chat, under its welcome. */
export function WelcomeChips({
  chips,
  disabled,
}: {
  chips: WelcomeChip[];
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    // Hidden while typing: with a phone's keyboard up there is no room.
    <div
      aria-label={t("chat.suggestedQuestions")}
      className="mt-3 flex flex-wrap justify-center gap-2 pointer-coarse:group-has-[textarea:focus]/shell:hidden"
    >
      {chips.map(({ label, run }) => (
        <button
          key={label}
          type="button"
          onClick={run}
          disabled={disabled}
          className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-60"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function FollowUps({
  questions,
  onAsk,
}: {
  questions: string[];
  onAsk: (question: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 sm:-mx-4 sm:px-4"
      aria-label={t("chat.suggestedQuestions")}
    >
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onAsk(question)}
          title={question}
          dir="auto"
          className="max-w-4/5 shrink-0 truncate rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-accent-ink transition-colors hover:border-accent hover:bg-accent-soft"
        >
          {question}
        </button>
      ))}
    </div>
  );
}
