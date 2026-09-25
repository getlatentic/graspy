import { useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import type { LessonCheck } from "@/lib/lesson";
import { AnswerOptions } from "@/shared/answer-options";
import { cn } from "@/shared/cn";
import { InlineMarkdown } from "@/shared/markdown";
import type { LessonWords } from "@/shared/words";
import { buttonStyles } from "./button-styles";

interface CheckProps {
  check: LessonCheck;
  isFinal: boolean;
  words: LessonWords;
  onAnswer: (chosen: number) => void;
  onClose: () => void;
  onAdvance: () => void;
}

interface Action {
  label: string;
  onClick: (event: MouseEvent) => void;
  disabled?: boolean;
}

// Under the slide it checks rather than a dialog: the view is a frame of its
// own height, where a dialog over it would be cut off.
export function Check({
  check,
  isFinal,
  words,
  onAnswer,
  onClose,
  onAdvance,
}: CheckProps) {
  const [chosen, setChosen] = useState<number>();
  const [checked, setChecked] = useState(false);

  const mark = () => {
    if (chosen === undefined) return;
    setChecked(true);
    onAnswer(chosen);
  };
  // The way on takes Check answer's place, so without the guard the second
  // tap of a double tap would skip the feedback the first tap revealed.
  const advanceOnce = (event: MouseEvent) => {
    if (event.detail < 2) onAdvance();
  };
  const next = isFinal ? words.finishLesson : words.nextSlide;
  const primary: Action = checked
    ? { label: next, onClick: advanceOnce }
    : {
        label: words.checkAnswer,
        onClick: mark,
        disabled: chosen === undefined,
      };

  return (
    <section
      aria-labelledby="check-title"
      className="mt-6 space-y-4 rounded-card border border-accent-line bg-raised p-4 sm:p-6"
    >
      <CheckHeading isFinal={isFinal} words={words} onClose={onClose} />
      <CheckQuestion
        check={check}
        chosen={chosen}
        checked={checked}
        onChoose={setChosen}
      />
      {checked && <Feedback check={check} chosen={chosen} words={words} />}
      <CheckActions primary={primary} words={words} onBack={onClose} />
    </section>
  );
}

function CheckHeading({
  isFinal,
  words,
  onClose,
}: {
  isFinal: boolean;
  words: LessonWords;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p
        id="check-title"
        className="text-xs font-semibold uppercase tracking-wider text-accent-ink"
      >
        {isFinal ? words.finalCheck : words.checkpoint}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={words.backToLesson}
        className="-me-2 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-ink"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function CheckQuestion({
  check,
  chosen,
  checked,
  onChoose,
}: {
  check: LessonCheck;
  chosen: number | undefined;
  checked: boolean;
  onChoose: (option: number) => void;
}) {
  return (
    <>
      <h3
        dir="auto"
        className="text-pretty text-lg font-semibold leading-7 text-ink"
      >
        <InlineMarkdown source={check.prompt} />
      </h3>
      <div className="grid gap-3">
        <AnswerOptions
          options={check.options}
          answerIndex={check.answerIndex}
          chosen={chosen}
          marked={checked}
          onChoose={onChoose}
        />
      </div>
    </>
  );
}

function Feedback({
  check,
  chosen,
  words,
}: {
  check: LessonCheck;
  chosen: number | undefined;
  words: LessonWords;
}) {
  const correct = chosen === check.answerIndex;
  const [title, said, fallback, colours] = correct
    ? [
        words.correct,
        check.correctFeedback,
        words.correctFallback,
        "bg-success-soft text-success",
      ]
    : [
        words.incorrect,
        check.incorrectFeedback,
        words.incorrectFallback,
        "bg-danger-soft text-danger",
      ];
  return (
    <div role="status" className={cn("rounded-card p-4 leading-6", colours)}>
      <p className="font-semibold">{title}</p>
      <p dir="auto" className="mt-1">
        <InlineMarkdown source={said || fallback} />
      </p>
    </div>
  );
}

function CheckActions({
  primary,
  words,
  onBack,
}: {
  primary: Action;
  words: LessonWords;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onBack}
        className={buttonStyles("secondary")}
      >
        {words.backToLesson}
      </button>
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        className={buttonStyles("primary")}
      >
        {primary.label}
      </button>
    </div>
  );
}
