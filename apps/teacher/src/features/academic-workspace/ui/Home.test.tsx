import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AcademicWorkspace, TeachingAssignment } from "../domain/academicWorkspace";
import { Home } from "./Home";

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

describe("Home", () => {
  it("leads with the work rather than a greeting, and counts the classes", () => {
    render(
      <Home
        workspace={workspace([
          assignment({ id: "a" }),
          assignment({ id: "b", displayName: "Basic Science · JSS 1", subject: "Basic Science" }),
        ])}
        onOpenWorkspace={vi.fn()} onAddClass={vi.fn()} onPlanTerm={vi.fn()} listing={{ kind: "all", heading: "Your classes", because: "" }} todaysClasses={[]}
      />,
    );

    // The largest type on the screen used to say "Good afternoon", which tells a
    // teacher nothing they opened the app to find out.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This week");
    expect(screen.getByText("2 classes · 2026/2027 · First term")).toBeVisible();
  });

  it("shows a card per class with its lessons-ready and current week", () => {
    render(
      <Home
        workspace={workspace([assignment({ id: "a" })])}
        onOpenWorkspace={vi.fn()} onAddClass={vi.fn()} onPlanTerm={vi.fn()} listing={{ kind: "all", heading: "Your classes", because: "" }} todaysClasses={[]}
      />,
    );

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("JSS 1")).toBeVisible();
    expect(within(card).getByText("Mathematics · First term")).toBeVisible();
    expect(within(card).getByText("2/3")).toBeVisible();
    expect(within(card).getByText("This week · Week 1")).toBeVisible();
    expect(within(card).getByText("Whole numbers counting and writing")).toBeVisible();
  });

  /// The first step of the journey used to live inside the second screen: the
  /// card said a class had no scheme and offered nothing but the lessons behind
  /// it, so a teacher had to find the term plan in a tab they could only reach
  /// by opening the class first.
  it("offers to plan the term of a class that has none, rather than only saying so", async () => {
    const user = userEvent.setup();
    const onPlanTerm = vi.fn();
    const onOpenWorkspace = vi.fn();
    render(
      <Home
        workspace={workspace([assignment({ id: "a", currentWeek: null })])}
        onOpenWorkspace={onOpenWorkspace}
        onAddClass={vi.fn()}
        onPlanTerm={onPlanTerm}
        listing={{ kind: "today", heading: "Today's classes" }}
        todaysClasses={["a"]}
      />,
    );

    expect(screen.getByText("No scheme adopted yet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Plan this term" }));

    expect(onPlanTerm).toHaveBeenCalledWith("a");
    expect(onOpenWorkspace).not.toHaveBeenCalled();
  });

  it("opens a class whose term is already planned, rather than planning it again", async () => {
    const user = userEvent.setup();
    const onOpenWorkspace = vi.fn();
    render(
      <Home
        workspace={workspace([assignment({ id: "a" })])}
        onOpenWorkspace={onOpenWorkspace}
        onAddClass={vi.fn()}
        onPlanTerm={vi.fn()} listing={{ kind: "all", heading: "Your classes", because: "" }} todaysClasses={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open class" }));

    expect(onOpenWorkspace).toHaveBeenCalledWith("a");
  });

  /// The front screen is about today, so it lists the classes today holds — in
  /// the order they are taught, not the order they were added.
  it("lists the classes today holds, in the order the day runs", () => {
    render(
      <Home
        workspace={workspace([
          assignment({ id: "a", displayName: "Mathematics · JSS 1 · A" }),
          assignment({ id: "b", displayName: "English Studies · JSS 2 · B" }),
        ])}
        onOpenWorkspace={vi.fn()}
        onAddClass={vi.fn()}
        onPlanTerm={vi.fn()}
        listing={{ kind: "today", heading: "Today's classes" }}
        todaysClasses={["b", "a"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Today's classes" })).toBeVisible();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("JSS 2B");
    expect(cards[1]).toHaveTextContent("JSS 1A");
  });

  /// Showing every class under "Today's classes" would be a lie, so the two
  /// reasons it can happen are said rather than papered over.
  it("says why it is listing every class when it cannot list today's", () => {
    render(
      <Home
        workspace={workspace([assignment({ id: "a" })])}
        onOpenWorkspace={vi.fn()}
        onAddClass={vi.fn()}
        onPlanTerm={vi.fn()}
        listing={{
          kind: "all",
          heading: "Your classes",
          because: "Nothing is timetabled today.",
        }}
        todaysClasses={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your classes" })).toBeVisible();
    expect(screen.getByText("Nothing is timetabled today.")).toBeVisible();
  });

  /// Two screens drew this card and drifted: only one of them carried the next
  /// lesson, so whichever a teacher started on decided what they were told.
  it("tells a teacher the same about a class wherever they meet it", () => {
    render(
      <Home
        workspace={workspace([
          assignment({
            id: "a",
            nextLesson: { topic: "Fractions", subtopic: "Equivalent fractions" },
          }),
        ])}
        onOpenWorkspace={vi.fn()}
        onAddClass={vi.fn()}
        onPlanTerm={vi.fn()} listing={{ kind: "all", heading: "Your classes", because: "" }} todaysClasses={[]}
      />,
    );

    expect(screen.getByText("Next lesson")).toBeVisible();
    expect(screen.getByText("Fractions · Equivalent fractions")).toBeVisible();
  });

  it("still says where the term stands when its week has no title", () => {
    render(
      <Home
        workspace={workspace([
          assignment({ id: "a", currentWeek: { ordinal: 3, title: null , standing: "thisWeek" } }),
        ])}
        onOpenWorkspace={vi.fn()} onAddClass={vi.fn()} onPlanTerm={vi.fn()} listing={{ kind: "all", heading: "Your classes", because: "" }} todaysClasses={[]}
      />,
    );

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("This week · Week 3")).toBeVisible();
    expect(within(card).queryByText("null")).toBeNull();
  });

  it("opens the workspace the teacher picks", async () => {
    const user = userEvent.setup();
    const onOpenWorkspace = vi.fn();
    render(
      <Home workspace={workspace([assignment({ id: "chosen" })])} onOpenWorkspace={onOpenWorkspace} onAddClass={vi.fn()} onPlanTerm={vi.fn()} listing={{ kind: "all", heading: "Your classes", because: "" }} todaysClasses={[]} />,
    );

    await user.click(screen.getByRole("button", { name: /Open class/ }));
    expect(onOpenWorkspace).toHaveBeenCalledWith("chosen");
  });

  it("counts only active classes and reads one as singular", () => {
    render(
      <Home
        workspace={workspace([
          assignment({ id: "a" }),
          assignment({ id: "archived", status: "archived" }),
        ])}
        onOpenWorkspace={vi.fn()} onAddClass={vi.fn()} onPlanTerm={vi.fn()} listing={{ kind: "all", heading: "Your classes", because: "" }} todaysClasses={[]}
      />,
    );

    expect(screen.getByText(/^1 class ·/)).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
