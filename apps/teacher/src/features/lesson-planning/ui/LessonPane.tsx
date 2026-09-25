import { LessonPaneScreen } from "./LessonPaneScreens";

/**
 * The one place a lesson is read, whatever state it is in.
 *
 * What shows is settled by one exhaustive dispatch over a view that carries
 * each screen's data — so exactly one screen draws, the compiler holds the
 * list complete, and a screen never re-checks what winning already proved.
 */
export function LessonPane() {
  return (
    <section
      className="min-w-0 rounded-card border border-rule bg-paper p-lg min-[60rem]:p-xl"
      aria-label="The lesson you are reading"
      aria-live="polite"
    >
      <LessonPaneScreen />
    </section>
  );
}
