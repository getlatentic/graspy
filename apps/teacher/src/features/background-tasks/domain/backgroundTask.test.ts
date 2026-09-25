import { describe, expect, it } from "vitest";

import {
  describeProgress,
  isOpen,
  isUnderWay,
  openTasks,
  partitionOpen,
  summariseOpenWork,
  workUnderWay,
  type BackgroundTask,
} from "./backgroundTask";

function task(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "task-1",
    kind: "lesson_preparation",
    lessonId: "lesson-1",
    label: "Preparing Equivalent fractions",
    status: "running",
    queuePosition: null,
    failureMessage: null,
    startedAt: "2026-07-28 09:40:00",
    updatedAt: "2026-07-28 09:41:00",
    finishedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe("background task", () => {
  it("counts work waiting for the engine as open, so the bar keeps showing it", () => {
    expect(isOpen(task({ status: "queued", queuePosition: 2 }))).toBe(true);
    expect(openTasks([task({ status: "queued", queuePosition: 1 }), task({ status: "succeeded" })])).toHaveLength(1);
  });

  it("treats queued and running alike as work already asked for", () => {
    expect(isUnderWay(task({ status: "queued", queuePosition: 1 }))).toBe(true);
    expect(isUnderWay(task({ status: "running" }))).toBe(true);
    expect(isUnderWay(task({ status: "interrupted" }))).toBe(false);
    expect(isUnderWay(task({ status: "failed" }))).toBe(false);
  });

  it("finds the work under way for one lesson and kind, and nothing else's", () => {
    const tasks = [
      task({ id: "a", status: "queued", queuePosition: 1 }),
      task({ id: "b", kind: "classwork", lessonId: "lesson-2" }),
      task({ id: "c", kind: "classwork", status: "succeeded" }),
    ];

    expect(workUnderWay(tasks, "lesson-1", "lesson_preparation")?.id).toBe("a");
    expect(workUnderWay(tasks, "lesson-2", "classwork")?.id).toBe("b");
    // The finished classwork run for lesson-1 must not block starting another.
    expect(workUnderWay(tasks, "lesson-1", "classwork")).toBeNull();
    expect(workUnderWay(tasks, "lesson-3", "lesson_preparation")).toBeNull();
  });

  it("says where waiting work stands in line, in words rather than a status", () => {
    expect(describeProgress(task({ status: "queued", queuePosition: 1 }))).toBe(
      "Waiting for the lesson engine — next in line.",
    );
    expect(describeProgress(task({ status: "queued", queuePosition: 3 }))).toBe(
      "Waiting for the lesson engine — number 3 in line.",
    );
    expect(describeProgress(task({ status: "running" }))).toBe("Working — you can carry on elsewhere.");
  });
});

describe("a run that failed", () => {
  const failed = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
    id: "task-failed",
    kind: "classwork",
    lessonId: "lesson-1",
    label: "Creating classwork — Trillions",
    status: "failed",
    queuePosition: null,
    failureMessage: "This section request is no longer active.",
    startedAt: "2026-07-31 12:52:06",
    updatedAt: "2026-07-31 12:52:56",
    finishedAt: "2026-07-31 12:52:56",
    dismissedAt: null,
    ...overrides,
  });

  /// The defect this exists for: a failure closed the task, so the bar vanished
  /// and a teacher who had carried on elsewhere was never told.
  it("stays on the bar so the teacher is told", () => {
    expect(isOpen(failed())).toBe(true);
    expect(openTasks([failed()])).toHaveLength(1);
  });

  it("says what went wrong rather than that it is working", () => {
    expect(describeProgress(failed())).toBe("This section request is no longer active.");
    expect(describeProgress(failed({ failureMessage: null }))).toContain("did not finish");
  });

  /// It is finished, so it is not work under way: nothing should treat it as a
  /// reason to withhold the offer to start again.
  it("is not work under way", () => {
    expect(isUnderWay(failed())).toBe(false);
  });
});

describe("a backlog of failures", () => {
  const failedAt = (id: string, finishedAt: string): BackgroundTask => ({
    id,
    kind: "lesson_preparation",
    lessonId: "lesson-1",
    label: `Preparing ${id}`,
    status: "failed",
    queuePosition: null,
    failureMessage: "It did not finish.",
    startedAt: finishedAt,
    updatedAt: finishedAt,
    finishedAt,
    dismissedAt: null,
  });

  /// Found on the owner's screen the moment failures began to show at all:
  /// eleven of them, never previously shown and so never dismissed, appeared
  /// together and buried the workspace behind them.
  it("keeps every failure, so none is lost to make room", () => {
    const many = ["a", "b", "c", "d", "e"].map((id, index) =>
      failedAt(id, `2026-07-31 12:0${index}:00`),
    );
    expect(partitionOpen(many).failed).toHaveLength(5);
  });

  it("puts the newest failure first, since that is the one still worth acting on", () => {
    const many = [
      failedAt("old", "2026-07-31 12:00:00"),
      failedAt("newest", "2026-07-31 12:09:00"),
      failedAt("middle", "2026-07-31 12:05:00"),
    ];
    expect(partitionOpen(many).failed.map(({ id }) => id)).toEqual(["newest", "middle", "old"]);
  });

  /// Work in hand and work that failed behave differently — one list changes by
  /// itself, the other waits for a person — so the bar shows them differently.
  it("separates work still going from work that failed", () => {
    const tasks = [
      failedAt("failed-one", "2026-07-31 12:00:00"),
      { ...failedAt("running", "2026-07-31 12:09:00"), status: "running" as const },
      { ...failedAt("queued", "2026-07-31 12:09:00"), status: "queued" as const },
    ];
    const { live, failed } = partitionOpen(tasks);
    expect(live.map(({ id }) => id).sort()).toEqual(["queued", "running"]);
    expect(failed.map(({ id }) => id)).toEqual(["failed-one"]);
  });
});

describe("work a teacher has read and cleared", () => {
  /// The owner's library opened on thirteen failures, the oldest four days
  /// old, and nothing on the screen could remove one. Clearing is recorded, so
  /// it has to survive being read back.
  it("is no longer open once it has been put away", () => {
    const cleared = task({ status: "failed", dismissedAt: "2026-08-01 15:00:00" });
    expect(isOpen(cleared)).toBe(false);
    expect(partitionOpen([cleared]).failed).toHaveLength(0);
  });

  it("stays open while it has not been put away", () => {
    expect(isOpen(task({ status: "failed" }))).toBe(true);
  });
});

describe("what the bar says it is holding", () => {
  it("counts what is running apart from what needs a person", () => {
    expect(summariseOpenWork(2, 3)).toBe("2 running · 3 need attention");
  });

  /// The defect this replaces: thirteen failures and nothing running were
  /// announced as "13 jobs running", with a spinner.
  it("never calls a failure running", () => {
    expect(summariseOpenWork(0, 13)).toBe("13 need attention");
  });

  it("says only what is running when nothing is waiting for a person", () => {
    expect(summariseOpenWork(1, 0)).toBe("1 running");
  });

  it("counts one failure as one", () => {
    expect(summariseOpenWork(0, 1)).toBe("1 needs attention");
  });
});
