import { Button, InlineLoading } from "@carbon/react";

import { creationAction } from "../domain/creationAction";
import type { ClassworkWorkspaceSnapshot } from "../domain/classwork";

type Run = NonNullable<ClassworkWorkspaceSnapshot["run"]>;

const stateLabels = {
  pending: "Waiting",
  generating: "Creating",
  done: "Ready",
  failed: "Needs attention",
} as const;

/**
 * How far the classwork has got, and what a teacher can do about it.
 *
 * Section by section while there is something to watch or act on; once every
 * section is ready the count says so and the classwork itself is what the
 * teacher came for.
 */
export function CreationProgress({
  run,
  queued,
  working,
  waitingMessage,
  onStart,
  onStop,
  onResume,
  onRetrySection,
}: {
  readonly run: Run | null;
  /**
   * The app's record says this run is queued rather than working.
   *
   * What to offer is worked out here, from this and the run, because nothing
   * else reads it — the screen above was deriving a decision for one panel.
   */
  readonly queued: boolean;
  /** A run is going, so a section's own retry would only queue behind it. */
  readonly working: boolean;
  readonly waitingMessage: string;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onResume: () => void;
  readonly onRetrySection: (sectionId: string) => void;
}) {
  const action = creationAction({ run, queued });
  const everyReady = run?.sections.every(({ status }) => status === "done") ?? false;
  return (
    <aside
      className="min-w-0 border-b border-rule-strong bg-paper-soft p-lg text-ink print:hidden"
      aria-label="Your classwork"
    >
      <div>
        <p className="m-0 mb-xs font-bold text-ink-secondary">Creation progress</p>
        <h2 className="m-0 min-w-0 font-display font-extrabold tracking-[-0.03em] text-ink [overflow-wrap:anywhere]">
          {run
            ? `${run.sections.filter(({ status }) => status === "done").length} of ${run.sections.length} parts finished`
            : "Ready to create"}
        </h2>
      </div>

      {!run ? (
        <p className="m-0 leading-body text-ink-secondary">
          Each confirmed lesson step becomes a complete section with review, example, practice and
          solution.
        </p>
      ) : everyReady ? null : (
        <ol className="mt-xl mb-0 grid list-none gap-0 border-t border-rule p-0">
          {run.sections.map((section) => (
            <SectionProgress
              key={section.id}
              section={section}
              working={working}
              onRetry={() => onRetrySection(section.id)}
            />
          ))}
        </ol>
      )}

      {/* Nothing to offer draws no rule over an empty space. */}
      {action === null ? null : (
        <div className="grid gap-sm border-t border-rule-strong pt-lg [&_.cds--btn]:w-full [&_.cds--btn]:max-w-none">
          {action === "waiting" ? (
            <>
              <p className="m-0 leading-body text-ink-secondary">{waitingMessage}</p>
              <Button kind="tertiary" onClick={onStop}>Stop creating</Button>
            </>
          ) : action === "start" ? (
            <Button onClick={onStart}>Create the classwork</Button>
          ) : action === "stop" ? (
            <Button kind="tertiary" onClick={onStop}>Stop creating</Button>
          ) : action === "continue" ? (
            <Button onClick={onResume}>Continue creating</Button>
          ) : (
            <p className="m-0 leading-body text-ink-secondary">
              Creation stopped. Ready sections are saved.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

/** One lesson step's section: where it has got to, and its own way back. */
function SectionProgress({
  section,
  working,
  onRetry,
}: {
  readonly section: Run["sections"][number];
  readonly working: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <li
      className="grid gap-sm py-md [&>span]:flex [&>span]:min-w-0 [&>span]:items-start [&>span]:justify-between [&>span]:gap-sm [&_p]:m-0 [&_p]:leading-body [&_p]:text-ink-secondary"
      data-state={section.status}
    >
      <span>
        <b className="min-w-0 [overflow-wrap:anywhere]">
          {section.sequence}. {section.stepTitle}
        </b>
        <span
          className="inline-flex min-h-[1.5rem] flex-none items-center whitespace-nowrap bg-paper-accent px-xs text-xs leading-none text-ink-secondary data-[state=done]:bg-success-soft data-[state=done]:text-success data-[state=failed]:bg-error-soft data-[state=failed]:text-error"
          data-state={section.status}
        >
          {stateLabels[section.status]}
        </span>
      </span>
      {section.status === "generating" ? (
        <InlineLoading description="Creating this section" status="active" />
      ) : null}
      {section.status === "failed" ? (
        <>
          <p>{section.lastError}</p>
          {/* Retrying starts a run, and the backend holds one slot per lesson.
              Offering the button while a run is going asks the teacher to take
              an action that can only come back as an error about their own work. */}
          {working ? (
            <p>This section is waiting for the work already running.</p>
          ) : (
            <Button kind="tertiary" onClick={onRetry}>Try this part again</Button>
          )}
        </>
      ) : null}
    </li>
  );
}
