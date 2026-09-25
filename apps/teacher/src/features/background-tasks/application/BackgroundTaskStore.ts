import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";
import type { BackgroundTaskGateway } from "./BackgroundTaskGateway";
import { isOpen, sameTasks, type BackgroundTask } from "../domain/backgroundTask";

const NO_TASKS: readonly BackgroundTask[] = [];

/** How often open work is re-read when no nudge has arrived. */
const IDLE_REREAD_MS = 4_000;

/**
 * The app's view of the work it is doing, held for the app's life rather than
 * a screen's.
 *
 * The record in the database is the truth. A change event only says the record
 * moved; the answer always comes from reading it. While work is open the store
 * also re-reads on a slow beat, so a nudge that arrives before anyone is
 * listening — or not at all — costs a few seconds rather than a stuck task.
 *
 * Nothing here starts, holds, or drives work. It watches, and it relays the
 * teacher's decision to stop something.
 */
export class BackgroundTaskStore {
  private tasks: readonly BackgroundTask[] = NO_TASKS;
  private readonly listeners = new Set<() => void>();
  private context: LessonContextRequest | null = null;
  private detachChanges: (() => void) | null = null;
  private attaching: Promise<void> | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private reading = false;

  constructor(private readonly gateway: BackgroundTaskGateway) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The current tasks. The same array is returned until something changes. */
  snapshot = (): readonly BackgroundTask[] => this.tasks;

  /**
   * Points the store at the class and term now on screen. Switching context
   * clears what was shown for the previous one rather than leaving another
   * class's work on the bar.
   */
  watch(context: LessonContextRequest): void {
    if (this.context && sameContext(this.context, context)) return;
    this.context = context;
    this.publish(NO_TASKS);
    void this.attachToChanges();
    void this.refresh();
  }

  /** Re-reads the record. Overlapping reads collapse into the one in flight. */
  async refresh(): Promise<void> {
    const context = this.context;
    if (!context || this.reading) return;
    this.reading = true;
    try {
      const tasks = await this.gateway.list(context);
      if (this.context === context) this.publish(tasks);
    } catch {
      // A failed read is not worth telling a teacher about: the work is
      // unaffected and the next read is a beat away.
    } finally {
      this.reading = false;
      this.keepPace();
    }
  }

  /** Stops a task at the teacher's request — the only way work is cancelled. */
  async cancel(taskId: string): Promise<void> {
    await this.gateway.cancel(taskId);
    await this.refresh();
  }

  /** Puts work that has ended away, at the teacher's request. */
  async dismiss(taskId: string): Promise<void> {
    await this.gateway.dismiss(taskId);
    await this.refresh();
  }

  /** Continues interrupted work from its records, at the teacher's request. */
  async resume(task: BackgroundTask): Promise<void> {
    const context = this.context;
    if (!context) throw new Error("No class is on screen to resume work in.");
    await this.gateway.resume(task, context);
    await this.refresh();
  }

  /** Releases the change subscription and the idle beat. */
  close(): void {
    this.detachChanges?.();
    this.detachChanges = null;
    this.stopPace();
  }

  private async attachToChanges(): Promise<void> {
    if (this.detachChanges || this.attaching) return this.attaching ?? undefined;
    this.attaching = this.gateway
      .onChanged(() => void this.refresh())
      .then((detach) => {
        this.detachChanges = detach;
      })
      .catch(() => {
        // Without the nudge the store still re-reads on its own beat.
      })
      .finally(() => {
        this.attaching = null;
      });
    return this.attaching;
  }

  private publish(tasks: readonly BackgroundTask[]): void {
    if (sameTasks(this.tasks, tasks)) return;
    this.tasks = tasks;
    for (const listener of this.listeners) listener();
  }

  /** The idle beat runs only while work is open, and stops when none is. */
  private keepPace(): void {
    const open = this.tasks.some(isOpen);
    if (open && this.idleTimer === null) {
      this.idleTimer = setInterval(() => void this.refresh(), IDLE_REREAD_MS);
    } else if (!open) {
      this.stopPace();
    }
  }

  private stopPace(): void {
    if (this.idleTimer === null) return;
    clearInterval(this.idleTimer);
    this.idleTimer = null;
  }
}

function sameContext(left: LessonContextRequest, right: LessonContextRequest): boolean {
  return (
    left.academicSessionId === right.academicSessionId &&
    left.academicPeriodId === right.academicPeriodId &&
    left.teachingAssignmentId === right.teachingAssignmentId
  );
}
