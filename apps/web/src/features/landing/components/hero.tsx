import { SignInPrompt } from "@/features/account/components/sign-in-link";
import { cn } from "@/lib/cn";
import { PAGE } from "../constants";
import { LessonPreview } from "./lesson-preview";
import { StartLearning } from "./start-learning";

export function Hero() {
  return (
    <section
      className={cn(
        PAGE,
        "grid grid-cols-1 items-center gap-12 pb-10 pt-6 sm:pt-12 lg:grid-cols-[1fr_minmax(0,26rem)] lg:gap-16 lg:pb-24 lg:pt-20",
      )}
    >
      <div>
        {/* The design sets the headline in a close grotesk. */}
        <h1 className="font-sans text-hero font-bold text-ink sm:text-6xl sm:tracking-tight">
          Understand
          <br />
          any topic.
        </h1>
        <p className="mt-5 text-pretty text-base leading-relaxed text-muted sm:max-w-md sm:text-lg">
          Lessons for your class, in your language.
        </p>
        <StartLearning className="mt-8 w-full rounded-full py-4 text-lg shadow-lg shadow-accent/25 sm:w-auto sm:px-10" />
        <SignInPrompt className="mt-4 text-center sm:text-start" />
      </div>
      <LessonPreview className="hidden lg:block" />
    </section>
  );
}
