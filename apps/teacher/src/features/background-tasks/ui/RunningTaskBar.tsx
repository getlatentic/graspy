import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import type { BackgroundTaskStore } from "../application/BackgroundTaskStore";
import { isResumable } from "../application/BackgroundTaskGateway";
import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import {
  describeProgress,
  partitionOpen,
  summariseOpenWork,
  type BackgroundTask,
} from "../domain/backgroundTask";
import { lessonRoute, openingForTaskKind } from "../../lesson-planning/ui/model/lessonOpening";
import { useBackgroundTasks } from "./useBackgroundTasks";

/**
 * The work in hand, kept on screen wherever the teacher goes.
 *
 * graspy takes minutes to write a lesson, and a teacher should be able to look
 * at next week while it does. This says what is being worked on and takes them
 * back to it; work carries on whether or not they are watching.
 */
export function RunningTaskBar({
  store,
  academicContext,
}: {
  readonly store: BackgroundTaskStore;
  readonly academicContext: ActiveAcademicContext;
}) {
  const tasks = useBackgroundTasks(store, {
    academicSessionId: academicContext.workspace.activeSessionId,
    academicPeriodId: academicContext.period.id,
    teachingAssignmentId: academicContext.assignment.id,
  });
  const { live, failed } = partitionOpen(tasks);
  const [hidden, setHidden] = useState(false);
  const open = [...live, ...failed];
  if (!open.length) return null;

  const summary = summariseOpenWork(live.length, failed.length);

  // Folded away, the bar still says what it holds. Folding is deliberately not
  // stopping — nothing is forgotten and the work never pauses either way.
  if (hidden) {
    return (
      <div className={barPosition} data-task-bar="folded" role="status" aria-label={summary}>
        <button
          className="justify-self-end flex min-h-[2.75rem] items-center gap-xs rounded-card border border-rule bg-paper px-md text-sm text-ink-secondary shadow-raised"
          type="button"
          onClick={() => setHidden(false)}
        >
          {live.length > 0 ? (
            <span
              className="size-md flex-none rounded-full border-2 border-accent-soft border-t-accent animate-spin motion-reduce:animate-[spin_3s_linear_infinite]"
              aria-hidden="true"
            />
          ) : null}
          {summary}
        </button>
      </div>
    );
  }

  return (
    <div className={barPosition} data-task-bar="open" role="status" aria-label={summary}>
      {live.map((task) => (
        <TaskRow key={task.id} task={task} store={store} />
      ))}
      {failed.length > 0 ? <FailedTasks tasks={failed} store={store} /> : null}
      <button
        className="justify-self-end min-h-[2.75rem] px-sm text-sm text-ink-secondary underline [text-underline-offset:0.2em]"
        type="button"
        onClick={() => setHidden(true)}
      >
        {live.length > 0 ? "Hide while this runs" : "Hide"}
      </button>
    </div>
  );
}

/**
 * Every failure, one at a time.
 *
 * A teacher who has been away can have many, and showing them together covers
 * the screen they were trying to get back to. Paging keeps all of them
 * reachable and the newest in front; dismissing one moves to the next rather
 * than leaving the page beyond the end.
 */
function FailedTasks({
  tasks,
  store,
}: {
  readonly tasks: readonly BackgroundTask[];
  readonly store: BackgroundTaskStore;
}) {
  const [position, setPosition] = useState(0);
  const at = Math.min(position, tasks.length - 1);
  const task = tasks[at];
  return (
    <TaskRow
      key={task.id}
      task={task}
      store={store}
      paging={
        tasks.length > 1 ? (
          <span
            className="flex flex-none items-center text-xs text-ink-secondary"
            role="group"
            aria-label={`Problem ${at + 1} of ${tasks.length}`}
          >
            <button
              type="button"
              className={failurePagingControl}
              aria-label="Newer"
              disabled={at === 0}
              onClick={() => setPosition(at - 1)}
            >
              ‹
            </button>
            <span className="tabular-nums" aria-hidden="true">
              {at + 1}/{tasks.length}
            </span>
            <button
              type="button"
              className={failurePagingControl}
              aria-label="Older"
              disabled={at >= tasks.length - 1}
              onClick={() => setPosition(at + 1)}
            >
              ›
            </button>
          </span>
        ) : null
      }
    />
  );
}

/** Compact enough to sit in the row, and still a 44px target. */
const failurePagingControl =
  "grid min-h-[2.75rem] min-w-[2.75rem] cursor-pointer place-items-center text-base font-semibold text-brand hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline";

/**
 * The bar keeps to the bottom of the screen and still takes its own room.
 *
 * Fixed, it floated over whatever was underneath — on the lessons screen it sat
 * across the first learning goal of the lesson being read. Sticky as the last
 * thing in the frame, it stays in view while the page scrolls and the page ends
 * below it rather than behind it.
 */
const barPosition =
  "flex-none ms-auto me-lg mb-lg grid gap-xs w-[min(30rem,calc(100vw_-_2*var(--spacing-lg)))]";

function TaskRow({
  task,
  store,
  paging,
}: {
  readonly task: BackgroundTask;
  readonly store: BackgroundTaskStore;
  /** Controls for moving between several of these, shown among the row's own. */
  readonly paging?: ReactNode;
}) {
  const navigate = useNavigate();
  const [resuming, setResuming] = useState(false);
  const [resumeFailure, setResumeFailure] = useState<string | null>(null);

  const resume = async () => {
    setResumeFailure(null);
    setResuming(true);
    try {
      await store.resume(task);
    } catch (error) {
      setResumeFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setResuming(false);
    }
  };

  // What happened reads across the whole card; the controls sit under it.
  // Sharing one line with four controls squeezed the message into a column
  // barely wider than its own minimum and clipped the lesson's name.
  return (
    <div
      className={`grid gap-sm py-sm px-md border rounded-card shadow-raised text-ink-secondary ${
        task.status === "interrupted" ? "border-accent-soft bg-paper-accent" : "border-rule bg-paper"
      }`}
    >
      <div className="flex items-start gap-sm">
      {task.status === "running" ? (
        <span
          className="mt-[0.3rem] size-md flex-none rounded-full border-2 border-accent-soft border-t-accent animate-spin motion-reduce:animate-[spin_3s_linear_infinite]"
          aria-hidden="true"
        />
      ) : task.status === "queued" ? (
        <svg
          className="mt-[0.2rem] flex-none text-ink-secondary"
          viewBox="0 0 32 32"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2zm0 26a12 12 0 1 1 12-12 12 12 0 0 1-12 12z" />
          <path d="M16.5 8H15v9l7.7 4.6.8-1.3-7-4.1z" />
        </svg>
      ) : (
        <svg
          className="mt-[0.2rem] flex-none"
          viewBox="0 0 32 32"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2zm0 26a12 12 0 1 1 12-12 12 12 0 0 1-12 12z" />
          <path d="M15 8h2v11h-2zM15 21h2v2h-2z" />
        </svg>
      )}
        {/* Paging between failures must not move the card under the cursor:
            the room for the longest of them is held whatever this one says, so
            Dismiss stays where the teacher just saw it. */}
        <span className="grid min-h-[4.25rem] min-w-0 flex-1 content-start gap-3xs">
          <strong className="line-clamp-2 text-base leading-snug text-ink">{task.label}</strong>
          <span className="line-clamp-3 text-xs leading-snug">{resumeFailure ?? describe(task)}</span>
        </span>
        {paging}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2xs">
        {isResumable(task) && (
          <button
            type="button"
            className="min-h-[2.75rem] flex-none cursor-pointer px-sm text-sm font-semibold text-brand hover:underline disabled:cursor-wait disabled:opacity-60"
            disabled={resuming}
            onClick={() => void resume()}
          >
            {resuming ? "Resuming…" : "Resume"}
          </button>
        )}
        <button
          type="button"
          className={`min-h-[2.75rem] flex-none cursor-pointer px-sm text-sm hover:underline ${
            isResumable(task) ? "text-ink-secondary" : "font-semibold text-brand"
          }`}
          onClick={() => navigate(lessonHref(task))}
        >
          Open
        </button>
        {task.status === "running" || task.status === "queued" ? (
          <button
            type="button"
            className="min-h-[2.75rem] flex-none cursor-pointer px-sm text-sm text-ink-secondary hover:underline"
            onClick={() => void store.cancel(task.id)}
          >
            Stop
          </button>
        ) : (
          // Work that has ended is put away, not cancelled — cancelling does
          // nothing to a task that already ended, which is why thirteen
          // failures could not be cleared.
          <button
            type="button"
            className="min-h-[2.75rem] flex-none cursor-pointer px-sm text-sm text-ink-secondary hover:underline"
            onClick={() => void store.dismiss(task.id)}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The lesson, opened where this work is.
 *
 * Opening on the plan whatever the work had been is what left a stopped slides
 * build showing no sign of itself.
 */
function lessonHref(task: BackgroundTask): string {
  return lessonRoute(task.lessonId, openingForTaskKind(task.kind));
}

function describe(task: BackgroundTask): string {
  if (task.status !== "interrupted") return describeProgress(task);
  return isResumable(task)
    ? "Stopped when the app closed. Resume to carry on where it left off."
    : "Stopped when the app closed. Open the lesson to start it again.";
}
