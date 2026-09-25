import { useState } from "react";
import { Lightbulb } from "lucide-react";
import type { PracticeQuestion } from "@/lib/content";
import { AnswerOptions } from "./answer-options";
import { cn } from "./cn";
import { InlineMarkdown } from "./markdown";
import { fill, type PracticeWords } from "./words";

interface QuestionBlockProps {
  question: PracticeQuestion;
  number: number;
  total: number;
  chosen: number | undefined;
  onChoose: (option: number) => void;
  words: PracticeWords;
}

export function QuestionBlock({
  question,
  number,
  total,
  chosen,
  onChoose,
  words,
}: QuestionBlockProps) {
  const answered = chosen !== undefined;

  return (
    <div className="space-y-3">
      {total > 1 && (
        <p className="text-xs font-medium text-muted">
          {fill(words.questionOf, { n: String(number), total: String(total) })}
        </p>
      )}
      <p dir="auto" className="font-semibold leading-7 text-ink">
        <InlineMarkdown source={question.question} />
      </p>
      <div className="space-y-2">
        <AnswerOptions
          options={question.options}
          answerIndex={question.answerIndex}
          chosen={chosen}
          marked={answered}
          onChoose={onChoose}
        />
      </div>
      {!answered && question.hint && (
        <Hint hint={question.hint} words={words} />
      )}
      {answered && (
        <Feedback
          question={question}
          correct={chosen === question.answerIndex}
          words={words}
        />
      )}
    </div>
  );
}

function Feedback({
  question,
  correct,
  words,
}: {
  question: PracticeQuestion;
  correct: boolean;
  words: PracticeWords;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-control px-3 py-2 text-sm text-ink",
        correct ? "bg-success-soft" : "bg-danger-soft",
      )}
    >
      <p
        className={cn(
          "font-semibold",
          correct ? "text-success" : "text-danger",
        )}
      >
        {correct ? words.correct : words.incorrect}
      </p>
      <p dir="auto" className="mt-1">
        <InlineMarkdown
          source={
            correct ? question.correctFeedback : question.incorrectFeedback
          }
        />
      </p>
    </div>
  );
}

function Hint({ hint, words }: { hint: string; words: PracticeWords }) {
  const [shown, setShown] = useState(false);
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
      >
        <Lightbulb className="size-4" aria-hidden="true" />
        {words.showHint}
      </button>
    );
  }
  return (
    <p
      dir="auto"
      className="flex gap-2 rounded-control bg-warning-soft px-3 py-2 text-sm text-ink"
    >
      <Lightbulb
        className="mt-0.5 size-4 shrink-0 text-warning"
        aria-hidden="true"
      />
      <span>
        <InlineMarkdown source={hint} />
      </span>
    </p>
  );
}
