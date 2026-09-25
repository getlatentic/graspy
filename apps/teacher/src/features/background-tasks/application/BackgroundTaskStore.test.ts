import { describe, expect, it, vi } from "vitest";

import { BackgroundTaskStore } from "./BackgroundTaskStore";
import type { BackgroundTaskGateway } from "./BackgroundTaskGateway";
import type { BackgroundTask } from "../domain/backgroundTask";

const CONTEXT = {
  academicSessionId: "session-1",
  academicPeriodId: "period-1",
  teachingAssignmentId: "assignment-1",
};

function task(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "task-1",
    kind: "lesson_preparation",
    lessonId: "lesson-1",
    label: "Preparing Millions and billions",
    status: "running",
    queuePosition: null,
    failureMessage: null,
    startedAt: "2026-07-24 10:00:00",
    updatedAt: "2026-07-24 10:00:00",
    finishedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

function gatewayWith(list: BackgroundTaskGateway["list"], overrides: Partial<BackgroundTaskGateway> = {}) {
  return {
    list,
    get: vi.fn().mockResolvedValue(null),
    cancel: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    onChanged: vi.fn().mockResolvedValue(() => undefined),
    ...overrides,
  } satisfies BackgroundTaskGateway;
}

/** Lets the store's in-flight promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("BackgroundTaskStore", () => {
  it("reads the record when pointed at a class and tells subscribers", async () => {
    const gateway = gatewayWith(vi.fn().mockResolvedValue([task()]));
    const store = new BackgroundTaskStore(gateway);
    const changed = vi.fn();
    store.subscribe(changed);

    store.watch(CONTEXT);
    await settle();

    expect(gateway.list).toHaveBeenCalledWith(CONTEXT);
    expect(store.snapshot()).toHaveLength(1);
    expect(changed).toHaveBeenCalled();
    store.close();
  });

  it("holds the same snapshot when a re-read changes nothing, so nothing re-renders", async () => {
    const gateway = gatewayWith(vi.fn().mockResolvedValue([task()]));
    const store = new BackgroundTaskStore(gateway);
    store.watch(CONTEXT);
    await settle();

    const first = store.snapshot();
    const changed = vi.fn();
    store.subscribe(changed);
    await store.refresh();

    expect(store.snapshot()).toBe(first);
    expect(changed).not.toHaveBeenCalled();
    store.close();
  });

  it("re-reads the record when the backend says it moved, rather than trusting the message", async () => {
    let notify = () => undefined as void;
    const list = vi
      .fn()
      .mockResolvedValueOnce([task()])
      .mockResolvedValue([task({ status: "succeeded", updatedAt: "2026-07-24 10:05:00" })]);
    const gateway = gatewayWith(list, {
      onChanged: vi.fn().mockImplementation((listener: () => void) => {
        notify = listener;
        return Promise.resolve(() => undefined);
      }),
    });
    const store = new BackgroundTaskStore(gateway);
    store.watch(CONTEXT);
    await settle();
    expect(store.snapshot()[0]?.status).toBe("running");

    notify();
    await settle();

    expect(store.snapshot()[0]?.status).toBe("succeeded");
    store.close();
  });

  it("keeps reading a task the app was closed under, so it can be resumed or discarded", async () => {
    const gateway = gatewayWith(vi.fn().mockResolvedValue([task({ status: "interrupted" })]));
    const store = new BackgroundTaskStore(gateway);
    store.watch(CONTEXT);
    await settle();

    expect(store.snapshot()[0]?.status).toBe("interrupted");
    store.close();
  });

  it("collapses overlapping reads into the one already in flight", async () => {
    const list = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([task()]), 5)),
    );
    const store = new BackgroundTaskStore(gatewayWith(list));
    store.watch(CONTEXT);
    void store.refresh();
    void store.refresh();
    await settle();

    expect(list).toHaveBeenCalledTimes(1);
    store.close();
  });

  it("shows no other class's work when the teacher switches context", async () => {
    const gateway = gatewayWith(vi.fn().mockResolvedValue([task()]));
    const store = new BackgroundTaskStore(gateway);
    store.watch(CONTEXT);
    await settle();
    expect(store.snapshot()).toHaveLength(1);

    store.watch({ ...CONTEXT, teachingAssignmentId: "assignment-2" });
    expect(store.snapshot()).toHaveLength(0);
    store.close();
  });

  it("survives a failed read without disturbing the teacher or losing what it had", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([task()])
      .mockRejectedValue(new Error("the database is busy"));
    const store = new BackgroundTaskStore(gatewayWith(list));
    store.watch(CONTEXT);
    await settle();

    await expect(store.refresh()).resolves.toBeUndefined();
    expect(store.snapshot()).toHaveLength(1);
    store.close();
  });

  it("stops a task only when asked, then re-reads", async () => {
    const gateway = gatewayWith(vi.fn().mockResolvedValue([task()]));
    const store = new BackgroundTaskStore(gateway);
    store.watch(CONTEXT);
    await settle();

    await store.cancel("task-1");

    expect(gateway.cancel).toHaveBeenCalledWith("task-1");
    expect(gateway.list).toHaveBeenCalledTimes(2);
    store.close();
  });

  it("resumes interrupted work in the watched class, then re-reads", async () => {
    const interrupted = task({ status: "interrupted" });
    const gateway = gatewayWith(vi.fn().mockResolvedValue([interrupted]));
    const store = new BackgroundTaskStore(gateway);
    store.watch(CONTEXT);
    await settle();

    await store.resume(interrupted);

    expect(gateway.resume).toHaveBeenCalledWith(interrupted, CONTEXT);
    expect(gateway.list).toHaveBeenCalledTimes(2);
    store.close();
  });

  it("refuses to resume before any class is on screen", async () => {
    const gateway = gatewayWith(vi.fn().mockResolvedValue([]));
    const store = new BackgroundTaskStore(gateway);

    await expect(store.resume(task({ status: "interrupted" }))).rejects.toThrow(
      "No class is on screen",
    );
    expect(gateway.resume).not.toHaveBeenCalled();
  });
});
