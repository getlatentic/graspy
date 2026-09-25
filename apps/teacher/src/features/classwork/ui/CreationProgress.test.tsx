import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreationProgress } from "./CreationProgress";
import type { ClassworkWorkspaceSnapshot } from "../domain/classwork";

type Run = NonNullable<ClassworkWorkspaceSnapshot["run"]>;

const runWith = (...sections: { status: string; lastError?: string }[]) =>
  ({
    status: "running",
    sections: sections.map((section, index) => ({
      id: `s${index}`,
      sequence: index + 1,
      stepTitle: `Step ${index + 1}`,
      lastError: section.lastError ?? null,
      status: section.status,
    })),
  }) as Run;

function rail(props: Partial<Parameters<typeof CreationProgress>[0]> = {}) {
  render(
    <CreationProgress
      run={runWith({ status: "done" }, { status: "pending" })}
      queued={false}
      working={false}
      waitingMessage=""
      onStart={vi.fn()}
      onStop={vi.fn()}
      onResume={vi.fn()}
      onRetrySection={vi.fn()}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("how far the instructionalMaterials have got", () => {
  it("counts what is ready and lists what is left", () => {
    rail();
    expect(screen.getByRole("heading", { name: "1 of 2 parts finished" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  /// The defect this exists for: the section that failed offered no way back,
  /// because a stopped run still reported itself as working.
  it("offers a failed section its own way back once nothing is running", async () => {
    const onRetrySection = vi.fn();
    rail({
      run: runWith({ status: "done" }, { status: "failed", lastError: "It did not pass its checks." }),
      onRetrySection,
    });

    expect(screen.getByText("It did not pass its checks.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try this part again" }));
    expect(onRetrySection).toHaveBeenCalledWith("s1");
  });

  /// Retrying starts a run and the engine holds one slot per lesson, so the
  /// offer would only come back as an error about the teacher's own work.
  it("withholds that offer while a run is going, and says why", () => {
    rail({
      run: runWith({ status: "generating" }, { status: "failed", lastError: "It stopped." }),
      working: true,
    });
    expect(screen.queryByRole("button", { name: "Try this part again" })).toBeNull();
    expect(screen.getByText("This section is waiting for the work already running.")).toBeVisible();
  });

  it("says nothing of its own once every section is written", () => {
    rail({ run: runWith({ status: "done" }, { status: "done" }) });
    expect(screen.getByRole("heading", { name: "2 of 2 parts finished" })).toBeVisible();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
