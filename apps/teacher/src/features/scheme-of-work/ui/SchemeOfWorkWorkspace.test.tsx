import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { SchemeOfWorkGateway } from "../application/SchemeOfWorkGateway";
import type { SchemeContextSnapshot } from "../domain/schemeOfWork";
import { SchemeOfWorkWorkspace } from "./SchemeOfWorkWorkspace";

const academicContext: ActiveAcademicContext = {
  sessionLabel: "2026/2027",
  period: { id: "period-first", academicSessionId: "session-2026", ordinal: 1, name: "First term", kind: "term" },
  assignment: {
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
    lessonsTotal: 4,
    lessonsReady: 2,
  },
  workspace: {
    school: { jurisdictionId: "jurisdiction-ng", jurisdiction: "Nigeria", countryCode: "NG", gradeSystemId: "grade-system-ng", gradeSystem: "Nigerian basic and secondary education" },
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
    assignments: [],
    activeSessionId: "session-2026",
    activePeriodId: "period-first",
    activeAssignmentId: "class-mathematics",
  },
};

const emptySnapshot: SchemeContextSnapshot = {
  scheme: null,
  availableTemplates: [],
};

function gatewayWith(
  snapshot: SchemeContextSnapshot,
  overrides: Partial<SchemeOfWorkGateway> = {},
): SchemeOfWorkGateway {
  return {
    getContext: vi.fn().mockResolvedValue(snapshot),
    createScheme: vi.fn().mockResolvedValue(snapshot),
    createSchemeFromTemplate: vi.fn().mockResolvedValue(snapshot),
    installTemplatePackage: vi.fn().mockResolvedValue(snapshot),
    saveWeek: vi.fn().mockResolvedValue(snapshot),
    saveEntry: vi.fn().mockResolvedValue(snapshot),
    archiveEntry: vi.fn().mockResolvedValue(snapshot),
    moveEntry: vi.fn().mockResolvedValue(snapshot),
    ...overrides,
  };
}

/** One teaching week holding one weekly plan, with every field filled in. */
function schemeWithEntry(entry: {
  readonly plannedLessonId: string | null;
}): SchemeContextSnapshot {
  return {
        scheme: {
          id: "scheme-1",
          title: "Mathematics · JSS 2 · First term",
          originTemplateId: null,
          academicSessionId: "session-2026",
          academicPeriodId: "period-first",
          academicPeriodName: "First term",
          teachingAssignmentId: "class-mathematics",
          curriculum: {
            id: "course-1",
            title: "Mathematics · JSS 2",
            subject: "Mathematics",
            gradeLevel: "JSS 2",
            framework: {
              id: "framework-1",
              name: "Nigeria Basic Education Curriculum",
              authority: "Curriculum Office",
              jurisdiction: "Nigeria",
              version: "2026",
              sourceUri: null,
            },
          },
          calendar: { startsOn: "2026-09-01", endsOn: "2026-09-07" },
          weeks: [
            {
              id: "week-1",
              ordinal: 1,
              startsOn: "2026-09-01",
              endsOn: "2026-09-07",
              kind: "teaching",
              title: null,
              entries: [
                {
                  id: "entry-1",
                  sequence: 1,
                  topic: "Whole numbers",
                  subtopic: "Place value",
                  curriculumUnit: { id: "unit-1", title: "Number and numeration" },
                  curriculumOutcomes: [
                    { id: "outcome-1", statement: "Represent whole numbers." },
                  ],
                  objectives: ["Identify place values."],
                  assessment: ["Complete an exit ticket."],
                  instructionalMaterials: ["Place-value chart"],
                  notes: "Use locally familiar examples.",
                  plannedLessonId: entry.plannedLessonId,
                },
              ],
            },
          ],
        },
        availableTemplates: [],
  };
}

describe("SchemeOfWorkWorkspace", () => {
  it("creates a curriculum-bound scheme from clear curriculum details and dates", async () => {
    const user = userEvent.setup();
    const createScheme = vi.fn().mockResolvedValue(emptySnapshot);
    const gateway = gatewayWith(emptySnapshot, { createScheme });
    render(
      <SchemeOfWorkWorkspace
        gateway={gateway}
        academicContext={academicContext}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Build my own" }));
    expect(screen.getByLabelText("Selected curriculum")).toHaveTextContent(
      "Mathematics · JSS 2",
    );
    expect(screen.queryByText(/provenance/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/source address/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create weekly scheme" }));

    expect(createScheme).toHaveBeenCalledWith({
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        teachingAssignmentId: "class-mathematics",
      },
      termStartsOn: "2026-09-01",
      termEndsOn: "2026-12-31",
      midTermBreakStartsOn: null,
      midTermBreakEndsOn: null,
    });
  });

  it("selects and applies a compatible installed scheme", async () => {
    const user = userEvent.setup();
    const snapshot: SchemeContextSnapshot = {
      scheme: null,
      availableTemplates: [
        {
          id: "template-lagos-maths-jss2-first",
          title: "Mathematics · JSS 2 · First term",
          publisher: "Lagos State Ministry of Education",
          jurisdiction: "Lagos State, Nigeria",
          edition: "2021",
          trust: "school",
          origin: "bundled",
          weekCount: 12,
          planCount: 10,
          weeks: [
            {
              ordinal: 1,
              kind: "teaching",
              title: "Whole numbers",
              topics: ["Whole numbers"],
            },
            {
              ordinal: 2,
              kind: "teaching",
              title: "Fractions",
              topics: ["Fractions"],
            },
          ],
        },
      ],
    };
    const createSchemeFromTemplate = vi.fn().mockResolvedValue(snapshot);
    const gateway = gatewayWith(snapshot, { createSchemeFromTemplate });

    render(
      <SchemeOfWorkWorkspace
        gateway={gateway}
        academicContext={academicContext}
      />,
    );

    const template = await screen.findByRole("radio", {
      name: /Mathematics · JSS 2 · First term/i,
    });
    expect(screen.getByText("Included with graspy")).toBeInTheDocument();
    expect(screen.queryByText(/publisher verified/i)).not.toBeInTheDocument();
    expect(template).toBeChecked();
    expect(screen.getByText("Week 1 · Whole numbers")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Use this scheme" }));

    expect(createSchemeFromTemplate).toHaveBeenCalledWith({
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        teachingAssignmentId: "class-mathematics",
      },
      templateId: "template-lagos-maths-jss2-first",
      termStartsOn: "2026-09-01",
      termEndsOn: "2026-12-31",
      midTermBreakStartsOn: null,
      midTermBreakEndsOn: null,
    });
  });

  it("imports a school scheme file through the library", async () => {
    const user = userEvent.setup();
    const installTemplatePackage = vi.fn().mockResolvedValue(emptySnapshot);
    const gateway = gatewayWith(emptySnapshot, { installTemplatePackage });
    render(
      <SchemeOfWorkWorkspace
        gateway={gateway}
        academicContext={academicContext}
      />,
    );

    const file = new File(["school-scheme-contents"], "maths.graspy-scheme", {
      type: "application/json",
    });
    await user.upload(await screen.findByLabelText("Import scheme file"), file);

    await waitFor(() => {
      expect(installTemplatePackage).toHaveBeenCalledWith({
        context: {
          academicSessionId: "session-2026",
          academicPeriodId: "period-first",
          teachingAssignmentId: "class-mathematics",
        },
        packageContents: "school-scheme-contents",
      });
    });
  });

  /// A class that falls behind — which is every class — has to be able to say
  /// so. The scheme is what the week's plan is written against, so a scheme
  /// that no longer matches the room plans the wrong lesson.
  it("moves a subtopic to the week a teacher will actually teach it", async () => {
    const user = userEvent.setup();
    const base = schemeWithEntry({ plannedLessonId: null });
    const scheme = base.scheme!;
    const snapshot: SchemeContextSnapshot = {
      ...base,
      scheme: {
        ...scheme,
        weeks: [
          ...scheme.weeks,
          {
            id: "week-2",
            ordinal: 2,
            startsOn: "2026-09-08",
            endsOn: "2026-09-14",
            kind: "teaching",
            title: null,
            entries: [],
          },
        ],
      },
    };
    const moveEntry = vi.fn().mockResolvedValue(snapshot);
    const gateway = gatewayWith(snapshot, { moveEntry });

    render(
      <SchemeOfWorkWorkspace
        gateway={gateway}
        academicContext={academicContext}
        onCreateLesson={vi.fn()}
      />,
    );

    const move = await screen.findByRole("combobox", { name: /Move .* to another week/ });
    await user.selectOptions(move, "week-2");

    expect(moveEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "entry-1", targetWeekId: "week-2" }),
    );
  });

  it("reopens every persisted weekly-plan field in the read view", async () => {
    const user = userEvent.setup();
    const onCreateLesson = vi.fn();
    const gateway = gatewayWith(schemeWithEntry({ plannedLessonId: null }));

    render(
      <SchemeOfWorkWorkspace
        gateway={gateway}
        academicContext={academicContext}
        onCreateLesson={onCreateLesson}
      />,
    );

    expect(await screen.findByText("Whole numbers")).toBeVisible();
    expect(screen.getByText("Place-value chart")).toBeVisible();
    expect(screen.getByText("Use locally familiar examples.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Plan lesson" }));
    expect(onCreateLesson).toHaveBeenCalledWith("week-1", "entry-1");
  });

  // A weekly plan carries one lesson. Offering to start a second is offering
  // something the library refuses, so the plan that has one leads to it instead.
  it("leads to the lesson a weekly plan already has, and does not offer a second", async () => {
    const user = userEvent.setup();
    const onCreateLesson = vi.fn();
    const onOpenLesson = vi.fn();
    const gateway = gatewayWith(schemeWithEntry({ plannedLessonId: "lesson-7" }));

    render(
      <SchemeOfWorkWorkspace
        gateway={gateway}
        academicContext={academicContext}
        onCreateLesson={onCreateLesson}
        onOpenLesson={onOpenLesson}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Open lesson" }));
    expect(onOpenLesson).toHaveBeenCalledWith("lesson-7");
    expect(screen.queryByRole("button", { name: "Plan lesson" })).not.toBeInTheDocument();
    expect(onCreateLesson).not.toHaveBeenCalled();
  });
});
