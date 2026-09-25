import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { LessonCheck, LessonSlide } from "@/lib/lesson";
import { cn } from "@/shared/cn";
import { InlineMarkdown } from "@/shared/markdown";
import { fill, type LessonWords } from "@/shared/words";
import { buttonStyles } from "./button-styles";
import { Check } from "./check";
import { withoutRepeatedTitle } from "./slide-body";
import { SlideMarkdown } from "./slide-markdown";
import type { LessonRecord } from "./use-lesson-record";
import type { SlideMove, SlidePlace } from "./use-slide-place";

const TYPE_WORD: Record<string, keyof LessonWords["slideType"]> = {
  concept_introduction: "concept",
  worked_example: "example",
  scaffolded_problem: "practice",
  misconception: "misconception",
  synthesis: "summary",
};

const ENTRANCE: Record<SlideMove, string> = {
  none: "motion-safe:animate-enter",
  forward:
    "motion-safe:animate-enter-from-end motion-safe:rtl:animate-enter-from-start",
  back: "motion-safe:animate-enter-from-start motion-safe:rtl:animate-enter-from-end",
};

const ACTION = cn(buttonStyles("primary"), "mt-8 w-full sm:w-auto");

interface SlideProps {
  slide: LessonSlide;
  place: SlidePlace;
  words: LessonWords;
  record: LessonRecord;
}

export function Slide({ slide, place, words, record }: SlideProps) {
  return (
    <section
      className={cn(
        "rounded-card border border-line bg-surface p-5 sm:p-8",
        ENTRANCE[place.move],
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
        {words.slideType[TYPE_WORD[slide.slideType] ?? "default"]}
      </p>
      <h2
        dir="auto"
        className="mt-1 text-balance text-xl font-semibold text-ink"
      >
        <InlineMarkdown source={slide.title} />
      </h2>
      <div className="mt-5">
        <SlideMarkdown
          source={withoutRepeatedTitle(slide.bodyMd, slide.title)}
          diagramSource={words.diagramSource}
        />
      </div>
      {slide.assessment ? (
        <SlideCheck
          check={slide.assessment}
          place={place}
          words={words}
          record={record}
        />
      ) : (
        place.isFinal && <FinishButton words={words} record={record} />
      )}
      <SlideNav place={place} words={words} />
    </section>
  );
}

function FinishButton({ words, record }: Pick<SlideProps, "words" | "record">) {
  return (
    <button
      type="button"
      onClick={() => void record.finish()}
      disabled={record.finishing}
      className={ACTION}
    >
      {record.finishing ? words.finishing : words.finishLesson}
    </button>
  );
}

function SlideCheck({
  check,
  place,
  words,
  record,
}: Omit<SlideProps, "slide"> & { check: LessonCheck }) {
  const [checking, setChecking] = useState(false);

  if (!checking) {
    return (
      <button
        type="button"
        onClick={() => setChecking(true)}
        className={ACTION}
      >
        {place.isFinal ? words.startFinalCheck : words.checkUnderstanding}
      </button>
    );
  }

  // Going on from the last slide there is so far stays on it, so the check
  // closes here rather than by the slide changing.
  const advance = () => {
    if (place.isFinal) {
      void record.finish();
    } else {
      setChecking(false);
      place.go(place.index + 1);
    }
  };

  return (
    <>
      <Check
        check={check}
        isFinal={place.isFinal}
        words={words}
        onAnswer={(chosen) =>
          void record.answerCheck(place.index, check, chosen)
        }
        onClose={() => setChecking(false)}
        onAdvance={advance}
      />
      {record.finishing && (
        <p role="status" className="mt-3 text-sm text-muted">
          {words.finishing}
        </p>
      )}
    </>
  );
}

function SlideNav({
  place: { index, total, go },
  words,
}: Pick<SlideProps, "place" | "words">) {
  return (
    <nav
      className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-4"
      aria-label={words.slides}
    >
      <button
        type="button"
        onClick={() => go(index - 1)}
        disabled={index === 0}
        className={buttonStyles("ghost", "sm")}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {words.previous}
      </button>
      <span className="nums text-xs text-muted">
        {fill(words.slideOf, {
          current: String(index + 1),
          total: String(total),
        })}
      </span>
      <button
        type="button"
        onClick={() => go(index + 1)}
        disabled={index >= total - 1}
        className={buttonStyles("ghost", "sm")}
      >
        {words.next}
        <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
      </button>
    </nav>
  );
}
