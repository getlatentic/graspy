import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n-context";
import type { LessonLanguage, LessonMove } from "@/lib/voice/voice-types";
import type { LessonState } from "../lib/lesson-state";
import { TeacherStrip } from "./teacher-strip";
import { TurnResult } from "./turn-result";

const inLanguage = (text: LessonMove["say_text"], language: LessonLanguage) =>
  text?.[language] ?? text?.en ?? "";

/** What the step shows: her words, and the question in large type. */
function StepWords({
  move,
  language,
}: {
  move: LessonMove;
  language: LessonLanguage;
}) {
  const shown = move.show ? inLanguage(move.show, language) : "";
  return (
    <div className="flex flex-col gap-3">
      {shown && (
        <p className="font-display text-4xl font-semibold text-ink" dir="auto">
          {shown}
        </p>
      )}
      <p className="text-pretty text-lg text-ink" dir="auto">
        {inLanguage(move.say_text, language)}
      </p>
    </div>
  );
}

function StatusLine({ state }: { state: LessonState }) {
  const { t } = useI18n();
  const { name } = state.phase;
  if (name === "teaching" || name === "result")
    return <>{t("voice.lesson.speaking")}</>;
  if (name === "your-turn" || name === "recording")
    return <>{t("voice.lesson.yourTurn")}</>;
  return null;
}

/** The teacher, what she says now, and the marked answer when there is one. */
export function LessonStage({
  state,
  language,
  onRetry,
}: {
  state: LessonState;
  language: LessonLanguage;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const { phase } = state;
  const speaking = phase.name === "teaching" || phase.name === "result";
  return (
    <Card className="flex flex-col gap-5">
      <TeacherStrip speaking={speaking} detail={<StatusLine state={state} />} />
      {(phase.name === "loading" || phase.name === "moving-on") && (
        <p role="status" className="flex items-center gap-2 text-muted">
          <Spinner className="text-accent-ink" />
          {t("voice.lesson.loading")}
        </p>
      )}
      {phase.name === "failed" && (
        <div className="flex flex-col items-start gap-3">
          <p>{t("voice.lesson.loadFailed")}</p>
          <Button variant="secondary" onClick={onRetry}>
            {t("voice.retry")}
          </Button>
        </div>
      )}
      {phase.name === "rest" && (
        <p className="text-lg text-ink">{t("voice.lesson.rest")}</p>
      )}
      {phase.name === "result" && <TurnResult turn={phase.turn} />}
      {"move" in phase &&
        phase.name !== "result" &&
        phase.name !== "moving-on" && (
          <StepWords move={phase.move} language={language} />
        )}
    </Card>
  );
}
