import type { ClassworkWorkspaceSnapshot } from "./classwork";

type Run = NonNullable<ClassworkWorkspaceSnapshot["run"]>;

/**
 * What the creation panel offers a teacher next.
 *
 * One name for a decision that was a condition and a nested ternary saying the
 * same things in a different order, so what the panel showed when — and when it
 * showed nothing at all — had to be worked out twice and matched up by eye.
 */
export type CreationAction =
  /** Waiting its turn at the engine; the teacher may stop it. */
  | "waiting"
  /** Nothing written yet. */
  | "start"
  /** Writing now. */
  | "stop"
  /** Stopped partway with sections still to write, and none of them failed. */
  | "continue"
  /** Stopped by the teacher; the panel says so and offers nothing. */
  | "stopped"
  /** Finished, or waiting on a failure the teacher must attend to first. */
  | null;

export function creationAction({
  run,
  queued,
}: {
  readonly run: Run | null;
  /** The app's record says this run is in the queue rather than working. */
  readonly queued: boolean;
}): CreationAction {
  if (queued) return "waiting";
  if (!run) return "start";
  if (run.sections.some(({ status }) => status === "generating")) return "stop";
  const anyFailed = run.sections.some(({ status }) => status === "failed");
  const anyPending = run.sections.some(({ status }) => status === "pending");
  // A failure is the teacher's to deal with section by section, so carrying on
  // past it is not offered until they have.
  if (anyPending && !anyFailed) return "continue";
  return run.status === "cancelled" ? "stopped" : null;
}
