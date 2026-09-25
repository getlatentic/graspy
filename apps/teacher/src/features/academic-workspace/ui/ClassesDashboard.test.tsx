import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AcademicWorkspace, TeachingAssignment } from "../domain/academicWorkspace";
import { ClassesDashboard } from "./ClassesDashboard";

function assignment(overrides: Partial<TeachingAssignment>): TeachingAssignment {
  return {
    id: "class-math",
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
    lessonsTotal: 3,
    lessonsReady: 2,
    currentWeek: { ordinal: 1, title: "Whole numbers counting and writing" , standing: "thisWeek" },
    nextLesson: { topic: "Whole Numbers", subtopic: "Millions" },
    ...overrides,
  };
}

function workspace(assignments: TeachingAssignment[]): AcademicWorkspace {
  return {
    school: {
      jurisdictionId: "j",
      jurisdiction: "Nigeria",
      countryCode: "NG",
      gradeSystemId: "gs",
      gradeSystem: "Nigerian basic and secondary education",
    },
    sessions: [
      { id: "session-2026", startYear: 2026, endYear: 2027, label: "2026/2027", status: "open", calendarKind: "terms" },
    ],
    periods: [
      { id: "period-first", academicSessionId: "session-2026", ordinal: 1, name: "First term", kind: "term" },
    ],
    assignments,
    activeSessionId: "session-2026",
    activePeriodId: "period-first",
    activeAssignmentId: assignments[0]?.id ?? "class-math",
  };
}

describe("ClassesDashboard", () => {
  it("shows a detailed card per class: ready, current week, and next lesson", () => {
    render(
      <ClassesDashboard
        workspace={workspace([assignment({ id: "a" })])}
        onOpenWorkspace={vi.fn()} onPlanTerm={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your classes & subjects");
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("2/3")).toBeVisible();
    expect(within(card).getByText("Whole numbers counting and writing")).toBeVisible();
    expect(within(card).getByText("Whole Numbers · Millions")).toBeVisible();
  });

  it("still says where the term stands when its week has no title", () => {
    render(
      <ClassesDashboard
        workspace={workspace([
          assignment({ id: "a", currentWeek: { ordinal: 3, title: null , standing: "thisWeek" } }),
        ])}
        onOpenWorkspace={vi.fn()} onPlanTerm={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("This week · Week 3")).toBeVisible();
    expect(within(card).queryByText(/·\s*$/)).toBeNull();
  });

  it("opens the workspace and reaches management from their own actions", async () => {
    const user = userEvent.setup();
    const onOpenWorkspace = vi.fn();
    const onManage = vi.fn();
    render(
      <ClassesDashboard
        workspace={workspace([assignment({ id: "chosen" })])}
        onOpenWorkspace={onOpenWorkspace} onPlanTerm={vi.fn()}
        onManage={onManage}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Open class/ }));
    expect(onOpenWorkspace).toHaveBeenCalledWith("chosen");

    await user.click(screen.getByRole("button", { name: "Add subject and class" }));
    expect(onManage).toHaveBeenCalled();
  });

  it("says so when a class has no scheme, and drops the next-lesson line", () => {
    render(
      <ClassesDashboard
        workspace={workspace([assignment({ id: "a", currentWeek: null, nextLesson: null })])}
        onOpenWorkspace={vi.fn()} onPlanTerm={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(screen.getByText("No scheme adopted yet")).toBeVisible();
    expect(screen.queryByText("Next lesson")).not.toBeInTheDocument();
  });
});
