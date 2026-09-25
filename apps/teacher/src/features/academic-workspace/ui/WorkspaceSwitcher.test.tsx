import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TeachingAssignment } from "../domain/academicWorkspace";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

function assignment(overrides: Partial<TeachingAssignment>): TeachingAssignment {
  return {
    id: "class-a",
    academicSessionId: "session-2026",
    subjectId: "subject-mathematics",
    subject: "Mathematics",
    gradeLevelId: "grade-jss-1",
    gradeLevel: "JSS 1",
    classSection: null,
    displayName: "Mathematics · JSS 1",
    curriculumCourseId: null,
    curriculumTitle: null,
    curriculumPublisher: null,
    curriculumTrust: null,
    status: "active",
    lessonsTotal: 0,
    lessonsReady: 0,
    ...overrides,
  };
}

const assignments: TeachingAssignment[] = [
  assignment({ id: "jss1-math", displayName: "Mathematics · JSS 1", subject: "Mathematics" }),
  assignment({ id: "jss1-science", displayName: "Basic Science · JSS 1", subject: "Basic Science" }),
  assignment({
    id: "jss1b-math",
    displayName: "Mathematics · JSS 1 · B",
    subject: "Mathematics",
    classSection: "B",
    gradeLevel: "JSS 1",
  }),
];

describe("WorkspaceSwitcher", () => {
  it("names the active workspace class-first and keeps the list closed until asked", () => {
    render(
      <WorkspaceSwitcher
        assignments={assignments}
        activeAssignment={assignments[0]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("JSS 1 · Mathematics")).toBeVisible();
    expect(screen.queryByPlaceholderText("Search class or subject")).not.toBeInTheDocument();
  });

  it("groups by class and merges a distinct section into the grade heading", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSwitcher
        assignments={assignments}
        activeAssignment={assignments[0]}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change class" }));

    expect(screen.getByText("JSS 1")).toBeVisible();
    expect(screen.getByText("JSS 1B")).toBeVisible();
    // Two subjects sit under JSS 1, one under JSS 1B.
    expect(screen.getAllByRole("button", { name: /Mathematics/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Basic Science" })).toBeVisible();
  });

  it("filters the list to what matches the search", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSwitcher
        assignments={assignments}
        activeAssignment={assignments[0]}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change class" }));
    await user.type(screen.getByPlaceholderText("Search class or subject"), "science");

    expect(screen.getByRole("button", { name: "Basic Science" })).toBeVisible();
    expect(screen.queryByText("JSS 1B")).not.toBeInTheDocument();
  });

  it("reports the chosen workspace and closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <WorkspaceSwitcher
        assignments={assignments}
        activeAssignment={assignments[0]}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change class" }));
    await user.click(screen.getByRole("button", { name: "Basic Science" }));

    expect(onSelect).toHaveBeenCalledWith("jss1-science");
    expect(screen.queryByPlaceholderText("Search class or subject")).not.toBeInTheDocument();
  });
});
