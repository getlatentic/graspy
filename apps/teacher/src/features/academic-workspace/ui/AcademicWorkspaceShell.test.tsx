import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useNavigate } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { AcademicWorkspaceGateway } from "../application/AcademicWorkspaceGateway";
import type {
  AcademicWorkspaceSnapshot,
  SetActiveAcademicContextRequest,
} from "../domain/academicWorkspace";
import { inferAcademicContext } from "../domain/academicWorkspace";
import { AcademicWorkspaceShell } from "./AcademicWorkspaceShell";
import { useWorkspaceOutlet } from "./useWorkspaceOutlet";
import type { SchemeOfWorkGateway } from "../../scheme-of-work/application/SchemeOfWorkGateway";
import type { CurriculumCatalogGateway } from "../../curriculum-catalog/application/CurriculumCatalogGateway";

/** A lessons screen stand-in: what a route renders from the outlet context. */
function TestLessons() {
  const { academicContext, resetToken } = useWorkspaceOutlet();
  return (
    <>
      <p data-testid="active-class">{academicContext.assignment.displayName}</p>
      <p data-testid="reset-token">{resetToken}</p>
    </>
  );
}

/** A home stand-in with the same open flow the real HomeRoute drives. */
function TestHome() {
  const { academicContext, controller, bumpReset, setLaunch } = useWorkspaceOutlet();
  const navigate = useNavigate();
  const workspace = academicContext.workspace;
  return (
    <>
      {workspace.assignments.map((assignment) => (
        <button
          key={assignment.id}
          type="button"
          onClick={() => {
            setLaunch(null);
            bumpReset();
            void controller.setActiveContext({
              academicSessionId: workspace.activeSessionId,
              academicPeriodId: workspace.activePeriodId,
              assignmentId: assignment.id,
            });
            navigate("/lessons");
          }}
        >
          Open {assignment.displayName}
        </button>
      ))}
    </>
  );
}

function renderShell(
  gateway: AcademicWorkspaceGateway,
  { path = "/lessons" }: { path?: string } = {},
) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AcademicWorkspaceShell
            gateway={gateway}
            curriculumGateway={curriculumGateway}
            schemeGateway={schemeGateway}
          />
        ),
        children: [
          { index: true, element: <TestHome /> },
          { path: "lessons", element: <TestLessons /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

const catalog = {
  subjects: [
    { id: "subject-mathematics", name: "Mathematics" },
    { id: "subject-english", name: "English Language" },
  ],
  gradeLevels: [
    { id: "grade-jss-1", gradeSystemId: "grade-system-ng", code: "JSS1", displayName: "JSS 1" },
    { id: "grade-jss-2", gradeSystemId: "grade-system-ng", code: "JSS2", displayName: "JSS 2" },
  ],
  jurisdictions: [{ id: "jurisdiction-ng", countryCode: "NG", country: "Nigeria", name: "Nigeria" }],
  gradeSystems: [{ id: "grade-system-ng", jurisdictionId: "jurisdiction-ng", name: "Nigerian basic and secondary education", version: "1" }],
};

const configuredSnapshot: AcademicWorkspaceSnapshot = {
  ...catalog,
  workspace: {
    school: {
      jurisdictionId: "jurisdiction-ng",
      jurisdiction: "Nigeria",
      countryCode: "NG",
      gradeSystemId: "grade-system-ng",
      gradeSystem: "Nigerian basic and secondary education",
    },
    sessions: [
      {
        id: "session-2026",
        startYear: 2026,
        endYear: 2027,
        label: "2026/2027",
        status: "open",
        calendarKind: "terms",
      },
    ],
    periods: [
      { id: "period-first", academicSessionId: "session-2026", ordinal: 1, name: "First term", kind: "term" },
      { id: "period-second", academicSessionId: "session-2026", ordinal: 2, name: "Second term", kind: "term" },
      { id: "period-third", academicSessionId: "session-2026", ordinal: 3, name: "Third term", kind: "term" },
    ],
    assignments: [
      {
        id: "class-mathematics",
        academicSessionId: "session-2026",
        subjectId: "subject-mathematics",
        subject: "Mathematics",
        gradeLevelId: "grade-jss-2",
        gradeLevel: "JSS 2",
        classSection: "A",
        displayName: "Mathematics · JSS 2 · A",
        curriculumCourseId: "course-mathematics-jss2",
        curriculumTitle: "Mathematics · JSS 2",
        curriculumPublisher: "Curriculum office",
        curriculumTrust: "verified",
        status: "active",
        lessonsTotal: 3,
        lessonsReady: 1,
      },
      {
        id: "class-english",
        academicSessionId: "session-2026",
        subjectId: "subject-english",
        subject: "English Language",
        gradeLevelId: "grade-jss-1",
        gradeLevel: "JSS 1",
        classSection: null,
        displayName: "English Language · JSS 1",
        curriculumCourseId: "course-english-jss1",
        curriculumTitle: "English Language · JSS 1",
        curriculumPublisher: "Curriculum office",
        curriculumTrust: "verified",
        status: "active",
        lessonsTotal: 2,
        lessonsReady: 0,
      },
    ],
    activeSessionId: "session-2026",
    activePeriodId: "period-first",
    activeAssignmentId: "class-mathematics",
  },
};

const schemeGateway: SchemeOfWorkGateway = {
  getContext: vi.fn().mockResolvedValue({ scheme: null, availableTemplates: [] }),
  createScheme: vi.fn().mockResolvedValue({ scheme: null, availableTemplates: [] }),
  createSchemeFromTemplate: vi
    .fn()
    .mockResolvedValue({ scheme: null, availableTemplates: [] }),
  installTemplatePackage: vi
    .fn()
    .mockResolvedValue({ scheme: null, availableTemplates: [] }),
  saveWeek: vi.fn().mockResolvedValue({ scheme: null, availableTemplates: [] }),
  saveEntry: vi.fn().mockResolvedValue({ scheme: null, availableTemplates: [] }),
  archiveEntry: vi.fn().mockResolvedValue({ scheme: null, availableTemplates: [] }),
  moveEntry: vi.fn().mockResolvedValue({ scheme: null, availableTemplates: [] }),
};

const curriculumGateway: CurriculumCatalogGateway = {
  getCatalog: vi.fn().mockResolvedValue({ packages: [], courses: [] }),
  installPackage: vi.fn().mockResolvedValue({ packages: [], courses: [] }),
};

function gatewayWith(
  initialSnapshot: AcademicWorkspaceSnapshot,
  overrides: Partial<AcademicWorkspaceGateway> = {},
): AcademicWorkspaceGateway {
  return {
    getSnapshot: vi.fn().mockResolvedValue(initialSnapshot),
    createWorkspace: vi.fn().mockResolvedValue(configuredSnapshot),
    createSession: vi.fn().mockResolvedValue(configuredSnapshot),
    addAssignment: vi.fn().mockResolvedValue(configuredSnapshot),
    updateAssignment: vi.fn().mockResolvedValue(configuredSnapshot),
    archiveAssignment: vi.fn().mockResolvedValue(configuredSnapshot),
    assignCurriculumCourse: vi.fn().mockResolvedValue(configuredSnapshot),
    setActiveContext: vi.fn().mockResolvedValue(configuredSnapshot),
    ...overrides,
  };
}

describe("AcademicWorkspaceShell", () => {
  it("opens a workspace from the subjects a teacher names, inferring the rest", async () => {
    const user = userEvent.setup();
    const gateway = gatewayWith({ workspace: null, ...catalog });
    renderShell(gateway);

    await user.click(await screen.findByRole("button", { name: "Mathematics" }));
    await user.selectOptions(screen.getByLabelText("Mathematics"), "grade-jss-2");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const inferredContext = inferAcademicContext(new Date());

    // Nothing is asked about the school year, its terms, or which one is
    // running — a teacher names subjects, and the rest follows from today.
    expect(gateway.createWorkspace).toHaveBeenCalledWith({
      startYear: inferredContext.startYear,
      jurisdictionId: "jurisdiction-ng",
      gradeSystemId: "grade-system-ng",
      calendarKind: "terms",
      periodNames: ["First term", "Second term", "Third term"],
      activePeriodOrdinal: inferredContext.activePeriodOrdinal,
      assignments: [
        { subject: "Mathematics", gradeLevelId: "grade-jss-2", classSection: null },
      ],
    });
    await waitFor(() =>
      expect(screen.getByText("JSS 2A · Mathematics")).toBeVisible(),
    );
  });

  it("opens the lessons of a class that has no curriculum attached", async () => {
    const withoutCurriculum: AcademicWorkspaceSnapshot = {
      ...configuredSnapshot,
      workspace: {
        ...configuredSnapshot.workspace!,
        assignments: configuredSnapshot.workspace!.assignments.map((assignment) => ({
          ...assignment,
          curriculumCourseId: null,
          curriculumTitle: null,
          curriculumPublisher: null,
          curriculumTrust: null,
        })),
      },
    };
    renderShell(gatewayWith(withoutCurriculum));

    // A teacher writing their own lesson is grounded by the installed source
    // material, so an unattached curriculum improves a lesson rather than
    // being the thing that permits one.
    await waitFor(() =>
      expect(screen.getByTestId("active-class")).toHaveTextContent(
        "Mathematics · JSS 2 · A",
      ),
    );
  });

  it("returns a teacher straight to their lessons, asking nothing again", async () => {
    const gateway = gatewayWith(configuredSnapshot);
    renderShell(gateway);

    await waitFor(() =>
      expect(screen.getByText("JSS 2A · Mathematics")).toBeVisible(),
    );
    expect(screen.queryByText("What do you teach?")).not.toBeInTheDocument();
    expect(gateway.createWorkspace).not.toHaveBeenCalled();
  });

  it("switches subject-class context without mixing the session or term", async () => {
    const user = userEvent.setup();
    const setActiveContext = vi.fn(
      async (request: SetActiveAcademicContextRequest) => ({
        ...configuredSnapshot,
        workspace: {
          ...configuredSnapshot.workspace!,
          activeAssignmentId: request.assignmentId,
        },
      }),
    );
    const gateway = gatewayWith(configuredSnapshot, { setActiveContext });
    renderShell(gateway);

    await user.click(await screen.findByRole("button", { name: "Change class" }));
    // The switcher groups by class, so the option carries the subject alone.
    await user.click(await screen.findByRole("button", { name: "English Language" }));

    await waitFor(() =>
      expect(setActiveContext).toHaveBeenCalledWith({
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        assignmentId: "class-english",
      }),
    );
    expect(screen.getByTestId("active-class")).toHaveTextContent(
      "English Language · JSS 1",
    );
  });

  it("opens a fresh lessons view from home", async () => {
    const user = userEvent.setup();
    const gateway = gatewayWith(configuredSnapshot);
    renderShell(gateway, { path: "/" });

    // Home lists the classes; opening one lands on a fresh lessons view. The
    // workspace bar with its tabs is not shown on home.
    expect(screen.queryByRole("link", { name: "Lessons" })).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Open Mathematics · JSS 2 · A" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("active-class")).toHaveTextContent(
        "Mathematics · JSS 2 · A",
      ),
    );
    expect(screen.getByTestId("reset-token")).toHaveTextContent("1");
  });
});
