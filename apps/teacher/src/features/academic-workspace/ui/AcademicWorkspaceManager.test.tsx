import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcademicWorkspaceManager } from "./AcademicWorkspaceManager";
import type { AcademicWorkspace, AcademicWorkspaceSnapshot } from "../domain/academicWorkspace";
import type { CurriculumCatalogSnapshot } from "../../curriculum-catalog/domain/curriculumCatalog";

const assignment = {
  id: "class-maths",
  academicSessionId: "session-1",
  subjectId: "subject-maths",
  subject: "Mathematics",
  gradeLevelId: "grade-jss1",
  gradeLevel: "JSS 1",
  classSection: "A",
  displayName: "Mathematics · JSS 1 · A",
  curriculumCourseId: null,
  curriculumTitle: null,
  curriculumPublisher: null,
  curriculumTrust: null,
  status: "active",
  lessonsTotal: 0,
  lessonsReady: 0,
} as unknown as AcademicWorkspace["assignments"][number];

const secondAssignment = {
  ...assignment,
  id: "class-english",
  subjectId: "subject-english",
  subject: "English",
  displayName: "English · JSS 1 · A",
} as unknown as AcademicWorkspace["assignments"][number];

const workspace = {
  school: { jurisdictionId: "j", jurisdiction: "Nigeria", countryCode: "NG", gradeSystemId: "g", gradeSystem: "NG" },
  sessions: [{ id: "session-1", startYear: 2026, endYear: 2027, label: "2026/2027", status: "open", calendarKind: "terms" }],
  periods: [{ id: "period-1", academicSessionId: "session-1", ordinal: 1, name: "First term", kind: "term" }],
  assignments: [assignment, secondAssignment],
  activeSessionId: "session-1",
  activePeriodId: "period-1",
  activeAssignmentId: "class-maths",
} as unknown as AcademicWorkspace;

const snapshot = {
  workspace,
  gradeLevels: [{ id: "grade-jss1", name: "JSS 1", gradeSystemId: "g", ordinal: 1 }],
  subjects: [{ id: "subject-maths", name: "Mathematics" }],
  jurisdictions: [],
  gradeSystems: [],
} as unknown as AcademicWorkspaceSnapshot;

function manager() {
  render(
    <AcademicWorkspaceManager
      snapshot={snapshot}
      workspace={workspace}
      pendingAction={null}
      error={null}
      onAdd={vi.fn().mockResolvedValue(true)}
      onUpdate={vi.fn().mockResolvedValue(true)}
      onArchive={vi.fn().mockResolvedValue(true)}
      onCreateSession={vi.fn().mockResolvedValue(true)}
      catalog={{ courses: [], installed: [] } as unknown as CurriculumCatalogSnapshot}
      curriculumLibrary={null}
      onAssignCurriculum={vi.fn().mockResolvedValue(true)}
    />,
  );
}

afterEach(cleanup);

describe("the class register", () => {
  /// The defect this exists for: adding and editing were separate states, so
  /// opening the add form and then editing a row put two editors on the same
  /// register — and saving one leaves the other's typing with nowhere to go.
  it("writes one class at a time, whether it is new or already there", async () => {
    const user = userEvent.setup();
    manager();

    await user.click(screen.getByRole("button", { name: "Add subject and class" }));
    expect(screen.getByRole("heading", { name: "Add a subject and class" })).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("heading", { name: /^Edit Mathematics/ })).toBeVisible();
    // The add form gave way rather than staying open beside it.
    expect(screen.queryByRole("heading", { name: "Add a subject and class" })).toBeNull();
  });

  /// The same defect from the other side: the editor belongs to the row whose
  /// turn it is, so editing one class must not put a form on every line.
  it("opens the editor on the class the teacher chose and no other", async () => {
    const user = userEvent.setup();
    manager();

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByRole("heading", { name: /^Edit Mathematics/ })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /^Edit English/ })).toBeNull();
    // The other class is still a row to read, not a form to fill in.
    expect(screen.getByRole("heading", { name: "English" })).toBeVisible();
  });

  it("closes the editor when the teacher backs out, leaving the register alone", async () => {
    const user = userEvent.setup();
    manager();

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: /^Edit Mathematics/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Mathematics" })).toBeVisible();
  });
});
