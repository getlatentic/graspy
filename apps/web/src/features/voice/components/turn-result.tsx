import { CheckCircle2, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/cn";
import type { Decision, MarkedTurn } from "@/lib/voice/voice-types";

const LABEL: Record<Decision, string> = {
  correct: "voice.lesson.correct",
  try_again: "voice.lesson.tryAgain",
  not_understood: "voice.lesson.notUnderstood",
};

/** The marked answer: whether it was right, what graspy heard, and her reply. */
export function TurnResult({ turn }: { turn: MarkedTurn }) {
  const { t } = useI18n();
  const correct = turn.decision === "correct";
  const Icon = correct ? CheckCircle2 : RotateCcw;
  return (
    <div role="status" className="flex flex-col gap-3">
      <p
        className={cn(
          "inline-flex items-center gap-2 self-start rounded-full px-3 py-1 font-semibold",
          correct
            ? "bg-success-soft text-success"
            : "bg-warning-soft text-warning",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        {t(LABEL[turn.decision])}
      </p>
      <p className="text-sm text-muted">
        {t("voice.lesson.heard")}:{" "}
        <span className="font-medium text-ink" dir="auto">
          {turn.transcript}
        </span>
      </p>
      <p className="text-pretty text-lg text-ink" dir="auto">
        {turn.feedback}
      </p>
    </div>
  );
}
