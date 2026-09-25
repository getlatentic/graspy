import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import { BackgroundTaskStore } from "../application/BackgroundTaskStore";
import type { BackgroundTaskGateway } from "../application/BackgroundTaskGateway";
import type { BackgroundTask } from "../domain/backgroundTask";
import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import { RunningTaskBar } from "./RunningTaskBar";

const academicContext = {
  workspace: { activeSessionId: "session-1" },
  period: { id: "period-1", name: "First term" },
  assignment: { id: "assignment-1", displayName: "Mathematics · JSS 2" },
} as unknown as ActiveAcademicContext;

function task(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "task-1",
    kind: "lesson_preparation",
    lessonId: "lesson-1",
    label: "Preparing Equivalent fractions",
    status: "interrupted",
    queuePosition: null,
    failureMessage: null,
    startedAt: "2026-07-24 09:40:00",
    updatedAt: "2026-07-24 09:41:00",
    finishedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

/** Reports where the bar navigated to, which is the whole of what Open owes. */
function LocationProbe({ onLocation }: { readonly onLocation: (href: string) => void }) {
  const { pathname, search } = useLocation();
  onLocation(`${pathname}${search}`);
  return null;
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

function renderBar(gateway: BackgroundTaskGateway) {
  const store = new BackgroundTaskStore(gateway);
  render(
    <MemoryRouter>
      <RunningTaskBar store={store} academicContext={academicContext} />
    </MemoryRouter>,
  );
  return store;
}

afterEach(cleanup);

describe("RunningTaskBar", () => {
  it("offers Resume for an interrupted preparation, and only Open for other interrupted work", async () => {
    const gateway = gatewayWith(
      vi.fn().mockResolvedValue([
        task(),
        task({ id: "task-2", kind: "classwork", label: "Creating lesson classwork" }),
      ]),
    );
    renderBar(gateway);

    await screen.findByText("Preparing Equivalent fractions");
    expect(screen.getAllByRole("button", { name: "Resume" })).toHaveLength(1);
    expect(
      screen.getByText("Stopped when the app closed. Open the lesson to start it again."),
    ).toBeInTheDocument();
  });

  /// The defect this exists for: Open went to the lesson whatever the work
  /// had been, so a stopped slides build opened the plan and left the teacher
  /// to find the build for themselves.
  it("opens each kind of work where that work is, not on the plan", async () => {
    const user = userEvent.setup();
    const destinations: string[] = [];
    const cases = [
      { kind: "classwork", expected: "/lessons?lesson=lesson-1&open=classwork" },
      { kind: "lesson_note", expected: "/lessons?lesson=lesson-1&open=note" },
      { kind: "differentiated_classwork", expected: "/lessons?lesson=lesson-1&open=groupClasswork" },
      // A lesson being prepared shows the run in its own pane already.
      { kind: "lesson_preparation", expected: "/lessons?lesson=lesson-1" },
    ];
    for (const { kind } of cases) {
      const store = new BackgroundTaskStore(gatewayWith(vi.fn().mockResolvedValue([task({ kind })])));
      render(
        <MemoryRouter>
          <RunningTaskBar store={store} academicContext={academicContext} />
          <Routes>
            <Route
              path="/lessons"
              element={<LocationProbe onLocation={(href) => destinations.push(href)} />}
            />
          </Routes>
        </MemoryRouter>,
      );
      await user.click(await screen.findByRole("button", { name: "Open" }));
      cleanup();
    }

    expect(destinations).toEqual(cases.map(({ expected }) => expected));
  });

  /// Seen on the owner's screen: eleven failures, none previously shown and so
  /// none dismissed, appeared together and buried the workspace behind them.
  it("shows one failure at a time and pages through the rest", async () => {
    const user = userEvent.setup();
    const failures = ["first", "second", "third"].map((id, index) =>
      task({
        id,
        status: "failed",
        kind: "classwork",
        label: `Creating classwork — ${id}`,
        failureMessage: `${id} did not finish.`,
        finishedAt: `2026-07-31 12:0${index}:00`,
        dismissedAt: null,
      }),
    );
    renderBar(gatewayWith(vi.fn().mockResolvedValue(failures)));

    // The newest is in front, and it is the only one on screen.
    expect(await screen.findByText("third did not finish.")).toBeVisible();
    expect(screen.queryByText("first did not finish.")).toBeNull();
    expect(screen.getByRole("group", { name: "Problem 1 of 3" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Older" }));
    expect(screen.getByText("second did not finish.")).toBeVisible();
    expect(screen.queryByText("third did not finish.")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Older" }));
    expect(screen.getByText("first did not finish.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Newer" }));
    expect(screen.getByText("second did not finish.")).toBeVisible();
  });

  it("resumes through the store and shows the work running once the record says so", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([task()])
      .mockResolvedValue([task({ status: "running" })]);
    const gateway = gatewayWith(list);
    renderBar(gateway);

    await userEvent.click(await screen.findByRole("button", { name: "Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Working — you can carry on elsewhere.")).toBeInTheDocument();
    });
    expect(gateway.resume).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1" }),
      {
        academicSessionId: "session-1",
        academicPeriodId: "period-1",
        teachingAssignmentId: "assignment-1",
      },
    );
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("shows waiting work with its place in line, and lets the teacher stop it", async () => {
    const gateway = gatewayWith(
      vi.fn().mockResolvedValue([task({ status: "queued", queuePosition: 2 })]),
    );
    renderBar(gateway);

    await screen.findByText("Waiting for the lesson engine — number 2 in line.");
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(gateway.cancel).toHaveBeenCalledWith("task-1");
  });

  it("tells the teacher when a resume is refused, and keeps the task for another try", async () => {
    const gateway = gatewayWith(vi.fn().mockResolvedValue([task()]), {
      resume: vi.fn().mockRejectedValue("The lesson plan changed since this preparation started."),
    });
    renderBar(gateway);

    await userEvent.click(await screen.findByRole("button", { name: "Resume" }));

    await screen.findByText("The lesson plan changed since this preparation started.");
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
  });

  /// Seen in the running app: the bar sat over an assessment question and cut
  /// it off mid-sentence. A teacher's only ways out were to stop their own work
  /// or read around it.
  /// The owner's library opened on thirteen failures with nothing running, and
  /// the bar folded away to "13 jobs running" with a live spinner.
  it("never says failures are running, and clears one for good when asked", async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn().mockResolvedValue(undefined);
    const store = renderBar(
      gatewayWith(
        vi.fn().mockResolvedValue([
          task({ id: "gone-wrong", status: "failed", failureMessage: "It did not finish." }),
        ]),
        { dismiss, cancel },
      ),
    );

    await user.click(await screen.findByRole("button", { name: "Hide" }));
    expect(screen.getByRole("button", { name: /1 needs attention/ })).toBeVisible();
    expect(screen.queryByText(/running/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /1 needs attention/ }));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    // Clearing an ended task is recorded, not cancelled — cancelling does
    // nothing to work that has already ended, which is the whole defect.
    expect(dismiss).toHaveBeenCalledWith("gone-wrong");
    expect(cancel).not.toHaveBeenCalled();
    store.close();
  });

  it("gets out of the way without stopping the work", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const store = renderBar(
      gatewayWith(
        vi.fn().mockResolvedValue([task({ status: "running" })]),
        { cancel },
      ),
    );

    await user.click(await screen.findByRole("button", { name: "Hide while this runs" }));

    expect(screen.queryByText("Preparing Equivalent fractions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 running/ })).toBeVisible();
    // Hiding is not stopping, and the difference has to be real.
    expect(cancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /1 running/ }));
    expect(screen.getByText("Preparing Equivalent fractions")).toBeVisible();
    store.close();
  });
});
