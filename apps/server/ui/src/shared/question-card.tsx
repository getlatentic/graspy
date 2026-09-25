import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { PracticeSet } from "@/lib/content";
import { askExplain, counts, type Score } from "./asks";
import { QuestionBlock } from "./question-block";
import { useAnswering } from "./use-answering";
import type { Shown } from "./use-tool-result";
import { fill, type PracticeWords } from "./words";

interface QuestionCardProps {
  shown: Shown<Pick<PracticeSet, "questions">>;
  label: string;
  icon: LucideIcon;
  intro: ReactNode;
  anotherLabel: string;
  askAnother: (score: Score) => string;
}

export function QuestionCard({
  shown,
  label,
  icon: Icon,
  intro,
  anotherLabel,
  askAnother,
}: QuestionCardProps) {
  const { app, result } = shown;
  const words = shown.words.practice;
  const { questions } = result.structuredContent;
  const { chosen, choose, say, busy, answered, score } = useAnswering(
    app,
    result._meta,
    questions,
  );

  return (
    <section
      aria-label={label}
      className="space-y-4 rounded-card border border-line bg-surface p-4"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="size-4 text-accent-ink" aria-hidden="true" />
        {label}
      </p>
      {intro}
      {questions.map((question, index) => (
        <QuestionBlock
          key={`${index}-${question.question}`}
          question={question}
          number={index + 1}
          total={score.total}
          chosen={chosen[index]}
          onChoose={(option) => choose(index, option)}
          words={words}
        />
      ))}
      {answered && (
        <Next
          score={score}
          busy={busy}
          words={words}
          anotherLabel={anotherLabel}
          onAnother={() => void say(askAnother(score))}
          onExplain={() => void say(askExplain(questions, chosen, words))}
        />
      )}
    </section>
  );
}

function Next({
  score,
  busy,
  words,
  anotherLabel,
  onAnother,
  onExplain,
}: {
  score: Score;
  busy: boolean;
  words: PracticeWords;
  anotherLabel: string;
  onAnother: () => void;
  onExplain: () => void;
}) {
  const { right, total } = score;
  return (
    <div className="space-y-3">
      {total > 1 && (
        <p className="text-sm font-semibold text-ink">
          {fill(words.score, counts(score))}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAnother}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-strong"
        >
          {anotherLabel}
        </button>
        {right < total && (
          <button
            type="button"
            onClick={onExplain}
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent"
          >
            {total === 1 ? words.explain : words.explainWrong}
          </button>
        )}
      </div>
      {busy && (
        <p role="status" className="text-sm text-muted">
          {words.busy}
        </p>
      )}
    </div>
  );
}
