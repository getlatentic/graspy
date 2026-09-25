import { z } from "zod";

/**
 * Work the app is doing for a teacher, as the whole app sees it.
 *
 * A task outlives the screen that started it: it is recorded before the work
 * begins and closed by whoever finishes it, so leaving a screen — or the app —
 * never loses the fact that the work happened.
 */
export const backgroundTaskStatusSchema = z.enum([
  "queued",
  "running",
  "interrupted",
  "succeeded",
  "failed",
  "cancelled",
]);

export const backgroundTaskSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  lessonId: z.string().min(1),
  label: z.string().min(1),
  status: backgroundTaskStatusSchema,
  /** Place in line across every class, for work still waiting for the engine. */
  queuePosition: z.number().int().positive().nullable(),
  failureMessage: z.string().nullable(),
  startedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  finishedAt: z.string().nullable(),
  /** When the teacher put this away, for work that has ended. */
  dismissedAt: z.string().nullable(),
});

export type BackgroundTaskStatus = z.infer<typeof backgroundTaskStatusSchema>;
export type BackgroundTask = z.infer<typeof backgroundTaskSchema>;

/**
 * Work still open: waiting for the engine, running now, cut off by a shutdown,
 * or failed and not yet seen.
 *
 * A failure used to close the task, so the bar simply vanished and a teacher
 * who had carried on elsewhere was never told their classwork had not been
 * written. Failure is the case the bar exists for.
 */
export function isOpen(task: BackgroundTask): boolean {
  // Put away is put away, and it survives the app closing — a teacher who has
  // read a failure and cleared it is not greeted by it again.
  if (task.dismissedAt !== null) return false;
  return (
    task.status === "queued" ||
    task.status === "running" ||
    task.status === "interrupted" ||
    task.status === "failed"
  );
}

/** Work under way — asked for and not yet ended, whether or not it has started. */
export function isUnderWay(task: BackgroundTask): boolean {
  return task.status === "queued" || task.status === "running";
}

/**
 * The work under way for one lesson of one kind, which is what a screen checks
 * before offering to start that work again.
 */
export function workUnderWay(
  tasks: readonly BackgroundTask[],
  lessonId: string,
  kind: string,
): BackgroundTask | null {
  return tasks.find((task) => task.lessonId === lessonId && task.kind === kind && isUnderWay(task)) ?? null;
}

/**
 * What the bar is holding, counted the way a teacher would count it.
 *
 * Running and needing attention are counted apart because they are different
 * facts: one is work in hand that will finish by itself, the other is work
 * waiting for a person. Calling thirteen failures "13 jobs running" was wrong
 * twice over — nothing was running, and a teacher does not call their lessons
 * jobs.
 */
export function summariseOpenWork(live: number, failed: number): string {
  const parts: string[] = [];
  if (live > 0) parts.push(`${live} running`);
  if (failed > 0) parts.push(`${failed} ${failed === 1 ? "needs" : "need"} attention`);
  return parts.join(" · ");
}

/** What the teacher is told the app is doing with this piece of work. */
export function describeProgress(task: BackgroundTask): string {
  // A failure says what went wrong. Reaching this with "Working" was possible
  // only because a failed task used to leave the bar before anyone read it.
  if (task.status === "failed") {
    return task.failureMessage ?? "This did not finish. Open the lesson to see what is left.";
  }
  if (task.status !== "queued") return "Working — you can carry on elsewhere.";
  return task.queuePosition !== null && task.queuePosition > 1
    ? `Waiting for the lesson engine — number ${task.queuePosition} in line.`
    : "Waiting for the lesson engine — next in line.";
}

export function openTasks(tasks: readonly BackgroundTask[]): BackgroundTask[] {
  return tasks.filter(isOpen).reverse();
}

/**
 * Open work split into what is still going and what has failed.
 *
 * They are shown differently because they behave differently: work in hand is
 * a list that grows and shrinks by itself, while failures accumulate and wait
 * for a person. Every failure that ever went unseen appearing at once buried
 * the screen, so the bar pages through them one at a time — none is dropped,
 * and the newest is the one on top.
 */
export function partitionOpen(tasks: readonly BackgroundTask[]): {
  readonly live: BackgroundTask[];
  readonly failed: BackgroundTask[];
} {
  const open = openTasks(tasks);
  return {
    live: open.filter(({ status }) => status !== "failed"),
    failed: open
      .filter(({ status }) => status === "failed")
      .sort((left, right) => (right.finishedAt ?? "").localeCompare(left.finishedAt ?? "")),
  };
}

/**
 * Whether two readings of the task list differ in anything a screen renders.
 *
 * The list is re-read on every nudge, and most re-reads change nothing; holding
 * the previous array when nothing moved keeps subscribers from re-rendering.
 */
export function sameTasks(
  left: readonly BackgroundTask[],
  right: readonly BackgroundTask[],
): boolean {
  return (
    left.length === right.length &&
    left.every((task, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        task.id === other.id &&
        task.status === other.status &&
        task.queuePosition === other.queuePosition &&
        task.label === other.label &&
        task.updatedAt === other.updatedAt &&
        task.failureMessage === other.failureMessage
      );
    })
  );
}
