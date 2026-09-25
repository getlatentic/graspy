import type { ComponentType } from "react";
import { Compass, HelpCircle, Lightbulb } from "lucide-react";
import { SectionLabel } from "@/components/ui/card";
import { useI18n, type Translate } from "@/lib/i18n-context";

interface StarterQuestionsProps {
  topic: string;
  subject: string;
  disabled: boolean;
  onAsk: (question: string) => void;
}

interface Starter {
  label: string;
  prompt: string;
  Icon: ComponentType<{ className?: string }>;
}

function startersFor(topic: string, subject: string, t: Translate): Starter[] {
  return [
    {
      label: t("chat.quickActionExplain"),
      prompt: t("chat.quickActionExplainPrompt", { topic }),
      Icon: Lightbulb,
    },
    {
      label: t("chat.quickActionExamples"),
      prompt: t("chat.quickActionExamplesPrompt", { topic }),
      Icon: HelpCircle,
    },
    {
      label: t("chat.quickActionRelated"),
      prompt: t("chat.quickActionRelatedPrompt", { topic, subject }),
      Icon: Compass,
    },
  ];
}

export function StarterQuestions({
  topic,
  subject,
  disabled,
  onAsk,
}: StarterQuestionsProps) {
  const { t } = useI18n();
  const starters = startersFor(topic, subject, t);

  return (
    // Hidden while typing: with a phone's keyboard up there is no room.
    <div className="mb-3 space-y-2 pointer-coarse:group-has-[textarea:focus]/shell:hidden">
      <SectionLabel>{t("chat.quickQuestions")}</SectionLabel>
      {starters.map(({ label, prompt, Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => onAsk(prompt)}
          disabled={disabled}
          className="flex w-full items-center gap-3 rounded-control border border-line bg-surface px-4 py-2.5 text-start text-sm font-medium text-ink transition-colors hover:border-accent disabled:opacity-60"
        >
          <Icon className="size-4 text-muted" aria-hidden="true" />
          <span>{label}</span>
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
