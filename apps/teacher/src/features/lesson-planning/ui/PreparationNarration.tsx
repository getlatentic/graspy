import { Button } from "@carbon/react";

import {
  preparationStepLabel,
  preparationStepsDone,
  type PreparationStepProgress,
} from "../domain/preparationProgress";

interface PreparationNarrationProps {
  readonly progress: readonly PreparationStepProgress[];
  readonly onCancel: () => void;
}

/**
 * What graspy is doing while a lesson is being prepared.
 *
 * The whole sequence is shown from the first moment, not revealed a step at a
 * time, so the wait has a known length instead of being an open question. A
 * teacher who wants to stop can see how much of their lesson is already
 * written before deciding.
 */
export function PreparationNarration({ progress, onCancel }: PreparationNarrationProps) {
  const done = preparationStepsDone(progress);

  return (
    <section className="flex flex-col gap-md border border-rule bg-paper p-lg [&_.cds--btn]:self-start" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="m-0 text-md leading-heading text-ink">Preparing your lesson</h3>
        {progress.length > 0 ? (
          <p className="m-0 text-sm tabular-nums text-ink-secondary">
            {done} of {progress.length} steps done
          </p>
        ) : (
          <p className="m-0 text-sm tabular-nums text-ink-secondary">Starting</p>
        )}
      </div>

      {progress.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-2xs p-0">
          {progress.map(({ step, state }) => (
            <li
              className="group/step flex min-h-[32px] items-center gap-sm text-sm text-ink-secondary data-[state=running]:font-semibold data-[state=running]:text-ink"
              key={step}
              data-state={state}
            >
              <span
                className="size-[8px] flex-none rounded-full bg-rule-strong group-data-[state=running]/step:bg-accent group-data-[state=done]/step:bg-accent group-data-[state=failed]/step:bg-error"
                aria-hidden="true"
              />
              <span className="group-data-[state=done]/step:text-ink-secondary">{preparationStepLabel(step)}</span>
              {state === "running" ? (
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-accent">now</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      <Button kind="ghost" onClick={onCancel}>
        Stop
      </Button>
    </section>
  );
}
