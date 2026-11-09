import { Check, X } from "lucide-react";
import { cn } from "./cn";
import { InlineMarkdown } from "./markdown";

type Verdict = "correct" | "wrong" | "chosen" | "open" | "struck";

const OPTION_STYLE: Record<Verdict, string> = {
  correct: "border-success bg-success-soft",
  wrong: "border-danger bg-danger-soft",
  chosen: "border-accent bg-accent-soft",
  open: "border-line bg-surface hover:border-accent",
  struck: "border-line bg-surface opacity-50",
};

const MARK_STYLE: Record<Verdict, string> = {
  correct: "border-success bg-success text-white",
  wrong: "border-danger bg-danger text-white",
  chosen: "border-accent bg-accent text-white",
  open: "border-line",
  struck: "border-line",
};

function verdictFor(
  index: number,
  chosen: number | undefined,
  answer: number,
  marked: boolean,
  struck: boolean,
): Verdict {
  if (struck && !(marked && index === answer)) return "struck";
  if (marked && index === answer) return "correct";
  if (marked && index === chosen) return "wrong";
  if (index === chosen) return "chosen";
  return "open";
}

export function AnswerOptions({
  options,
  answerIndex,
  chosen,
  marked,
  struck,
  onChoose,
}: {
  options: string[];
  answerIndex: number;
  chosen: number | undefined;
  marked: boolean;
  /** Options taken out of the question by help: shown, but not to be chosen. */
  struck?: ReadonlySet<number>;
  onChoose: (option: number) => void;
}) {
  return options.map((text, index) => (
    <AnswerOption
      key={index}
      text={text}
      verdict={verdictFor(
        index,
        chosen,
        answerIndex,
        marked,
        struck?.has(index) ?? false,
      )}
      locked={marked || (struck?.has(index) ?? false)}
      onChoose={() => onChoose(index)}
    />
  ));
}

function AnswerOption({
  text,
  verdict,
  locked,
  onChoose,
}: {
  text: string;
  verdict: Verdict;
  locked: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={locked}
      aria-pressed={verdict === "chosen"}
      className={cn(
        "flex w-full items-start gap-3 rounded-card border-2 px-4 py-3 text-start transition-colors disabled:cursor-default",
        OPTION_STYLE[verdict],
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          MARK_STYLE[verdict],
        )}
        aria-hidden="true"
      >
        {verdict === "correct" && <Check className="size-3" />}
        {verdict === "wrong" && <X className="size-3" />}
        {verdict === "chosen" && (
          <span className="size-2 rounded-full bg-white" />
        )}
      </span>
      <span dir="auto" className="min-w-0 flex-1 leading-6 text-ink">
        <InlineMarkdown source={text} />
      </span>
    </button>
  );
}
