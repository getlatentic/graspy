export interface PlanTimings {
  /** Milliseconds from the request to the first subject whose topics arrived. */
  firstSubjectMs: number | null;
  /** Milliseconds from the request to the end of the topic stream. */
  streamMs: number | null;
  /** Milliseconds the first lesson took to make, once its wait began. */
  firstLessonMs: number | null;
  subjects: number;
}

export type PlanStep = "firstSubject" | "stream" | "firstLesson";

/** Times the steps of making a plan. Holds numbers only, never what the learner asked for. */
export class PlanTimer {
  private readonly clock: () => number;
  private readonly startedAt: number;
  private lessonStartedAt: number | null = null;
  private readonly marks: Partial<Record<PlanStep, number>> = {};

  constructor(clock: () => number = () => performance.now()) {
    this.clock = clock;
    this.startedAt = clock();
  }

  firstSubject(): void {
    this.marks.firstSubject ??= this.clock() - this.startedAt;
  }

  streamDone(): void {
    this.marks.stream = this.clock() - this.startedAt;
  }

  lessonStarted(): void {
    this.lessonStartedAt = this.clock();
  }

  lessonDone(): void {
    if (this.lessonStartedAt === null) return;
    this.marks.firstLesson = this.clock() - this.lessonStartedAt;
  }

  timings(subjects: number): PlanTimings {
    return {
      firstSubjectMs: round(this.marks.firstSubject),
      streamMs: round(this.marks.stream),
      firstLessonMs: round(this.marks.firstLesson),
      subjects,
    };
  }
}

const round = (ms: number | undefined) =>
  ms === undefined ? null : Math.round(ms);

/** Printed outside production builds only, so a developer or staging run shows where the time went. */
export function reportPlanTimings(timings: PlanTimings): void {
  if (import.meta.env.MODE === "production") return;
  console.info("[plan-timing]", JSON.stringify(timings));
}
