import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanTimer, reportPlanTimings } from "./plan-timing";

const clockAt = (times: number[]) => {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
};

describe("PlanTimer", () => {
  it("measures each step from its own start, and the first subject only once", () => {
    // start, first subject, stream done, lesson start, lesson done
    const timer = new PlanTimer(clockAt([1000, 1400, 2500, 2600, 9100]));
    timer.firstSubject();
    timer.firstSubject();
    timer.streamDone();
    timer.lessonStarted();
    timer.lessonDone();

    expect(timer.timings(3)).toEqual({
      firstSubjectMs: 400,
      streamMs: 1500,
      firstLessonMs: 6500,
      subjects: 3,
    });
  });

  it("leaves a step it never saw as null", () => {
    const timer = new PlanTimer(clockAt([0, 100]));
    timer.streamDone();
    timer.lessonDone();

    expect(timer.timings(1)).toEqual({
      firstSubjectMs: null,
      streamMs: 100,
      firstLessonMs: null,
      subjects: 1,
    });
  });
});

describe("reportPlanTimings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  const timings = {
    firstSubjectMs: 1,
    streamMs: 2,
    firstLessonMs: 3,
    subjects: 2,
  };

  it("prints numbers only outside production", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MODE", "staging");
    reportPlanTimings(timings);

    expect(info).toHaveBeenCalledWith("[plan-timing]", JSON.stringify(timings));
  });

  it("prints nothing in production", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MODE", "production");
    reportPlanTimings(timings);

    expect(info).not.toHaveBeenCalled();
  });
});
