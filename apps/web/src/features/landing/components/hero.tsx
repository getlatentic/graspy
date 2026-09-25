import { SignInPrompt } from "@/features/account/components/sign-in-link";
import { cn } from "@/lib/cn";
import { PAGE } from "../constants";
import { LessonPreview } from "./lesson-preview";
import { SproutNote } from "./sprout-note";
import { StartLearning } from "./start-learning";

export function Hero() {
  return (
    <section
      className={cn(
        PAGE,
        "grid grid-cols-1 items-center gap-12 pb-10 pt-6 sm:pt-12 lg:grid-cols-[1fr_minmax(0,26rem)] lg:gap-16 lg:pb-24 lg:pt-20",
      )}
    >
      <div className="relative">
        <SproutNote className="absolute -end-4 -top-2 h-56 w-44 sm:h-64 sm:w-52 lg:hidden" />
        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-widest text-muted">
            Learn • Practice • Grow
          </p>
          {/* The design sets the headline in a close grotesk. */}
          <h1 className="mt-4 font-sans text-hero font-bold text-ink sm:text-6xl sm:tracking-tight">
            Understand
            <br />
            any topic.
          </h1>
          {/* pe-24 keeps clear of the note beside it on a phone. */}
          <p className="mt-5 pe-24 text-pretty text-base leading-relaxed text-muted sm:max-w-md sm:pe-0 sm:text-lg">
            graspy teaches your curriculum step by step. Ask questions, get
            clear explanations, and practise at your pace.
          </p>
        </div>
        <StartLearning className="relative mt-8 w-full rounded-full py-4 text-lg shadow-lg shadow-accent/25 sm:w-auto sm:px-10" />
        <SignInPrompt className="relative mt-4 text-center sm:text-start" />
      </div>
      <LessonPreview className="hidden lg:block" />
    </section>
  );
}
