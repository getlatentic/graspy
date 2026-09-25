import { Button } from "@carbon/react";
import type { ReactNode } from "react";

interface LessonFollowUpsProps {
  /** Printing needs a lesson the teacher has marked ready, so it is offered only then. */
  readonly approved: boolean;
  readonly printForPupils: ReactNode;
  readonly printWithAnswers: ReactNode;
  readonly onOpenGroupClasswork?: () => void;
}

/**
 * What a teacher does next, offered where the lesson ends.
 *
 * Every one of these already worked; each was somewhere else. Printing sat
 * inside the document behind the review bar and the group classwork sat in the
 * header, so finishing a lesson meant going looking for the obvious next step.
 */
export function LessonFollowUps({
  approved,
  printForPupils,
  printWithAnswers,
  onOpenGroupClasswork,
}: LessonFollowUpsProps) {
  return (
    <section className="mt-lg flex flex-col gap-sm border-t border-rule pt-lg [&_h2]:m-0 [&_h2]:text-md [&_h2]:leading-heading [&_h2]:text-ink" aria-labelledby="lesson-follow-ups-title">
      <h2 id="lesson-follow-ups-title">What next?</h2>
      {approved ? (
        <div className="flex flex-wrap gap-sm">
          {printForPupils}
          {printWithAnswers}
          {onOpenGroupClasswork ? (
            <Button kind="tertiary" onClick={onOpenGroupClasswork}>
              Make versions for different groups
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="m-0 max-w-[68ch] text-sm leading-reading text-ink-secondary">
          Read the lesson through and mark it ready, then you can print it and
          make versions for different groups.
        </p>
      )}
    </section>
  );
}
