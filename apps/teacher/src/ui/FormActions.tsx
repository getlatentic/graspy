import { InlineNotification } from "@carbon/react";
import type { ReactNode } from "react";

/**
 * A form's actions, with what went wrong the last time they were used.
 *
 * The failure is reported here rather than at the top of the form because this
 * is where the teacher is: they have just pressed one of these. A long form
 * reporting at its top changes nothing they can see, so a refused save reads as
 * a button that does nothing — which is exactly how the one-lesson-per-weekly-
 * plan refusal went unnoticed.
 *
 * `aria-live` is on the region rather than the notification so the message is
 * announced when it replaces nothing, which is the case that matters.
 */
export function FormActions({
  failure,
  children,
}: {
  /** What the last attempt came to, or `null` when it has not failed. */
  readonly failure: { readonly title: string; readonly detail: string } | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-md" aria-live="polite">
      {failure ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={failure.title}
          subtitle={failure.detail}
        />
      ) : null}
      <div className="flex flex-wrap gap-sm">{children}</div>
    </div>
  );
}
