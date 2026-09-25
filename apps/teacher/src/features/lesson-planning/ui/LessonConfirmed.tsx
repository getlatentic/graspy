import { Button } from "@carbon/react";

/**
 * What a teacher does next, offered above the lesson they have just settled.
 *
 * Two mistakes are being avoided here, one after the other. Confirming used to
 * drop the teacher on the lesson list, so the obvious next step — the classwork
 * the class works from — meant finding the lesson again to reach a tab that had
 * been one click away a moment earlier. Replacing that with a screen of its own
 * fixed the step and lost everything else: it was handed only the topic, so a
 * teacher was told a lesson was confirmed with no sight of which week, which
 * goals, or a line of what they had approved.
 *
 * It says the same thing in the place the lesson already is. The confirmed
 * lesson is underneath, the week is beside it, and the next step is the first
 * thing read.
 */
export function LessonConfirmed({
  onCreateClasswork,
}: {
  readonly onCreateClasswork: () => void;
}) {
  return (
    <section
      className="mb-lg grid gap-md border-s-[3px] border-brand bg-paper-accent p-md"
      aria-labelledby="lesson-confirmed-next"
    >
      <div>
        <p className="m-0 mb-2xs text-sm font-extrabold tracking-[0.01em] text-accent">
          Lesson confirmed
        </p>
        <h2 className="m-0 text-md leading-heading text-ink" id="lesson-confirmed-next">
          Next, graspy writes the classwork your pupils do
        </h2>
        <p className="m-0 mt-2xs text-sm leading-body text-ink-secondary">
          The review, worked example, practice and solution for each step.
        </p>
      </div>
      <Button className="justify-self-start min-h-[2.75rem]" onClick={onCreateClasswork}>
        Create the classwork
      </Button>
    </section>
  );
}
