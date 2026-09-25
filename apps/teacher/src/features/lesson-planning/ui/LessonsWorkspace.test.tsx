import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveAcademicContext } from "../../academic-workspace/ui/AcademicWorkspaceShell";
import type { LessonPlanningGateway } from "../application/LessonPlanningGateway";
import type { GranularLessonGenerator } from "../infrastructure/LocalGranularLessonGenerator";
import type { GranularLessonRecord } from "../domain/granularLesson";
import type { LessonWorkspaceRequest, LessonWorkspaceSnapshot } from "../domain/lessonPlanning";
import type { ClassworkGateway } from "../../classwork/application/ClassworkGateway";
import type { LessonNoteGenerator } from "../application/LessonNoteGenerator";
import type { LessonEvidenceGateway } from "../../learner-evidence/application/LessonEvidenceGateway";
import type { DifferentiatedClassworkGateway } from "../../differentiated-classwork/application/DifferentiatedClassworkGateway";
import { LessonsWorkspace } from "./LessonsWorkspace";
import { BackgroundTaskStore } from "../../background-tasks/application/BackgroundTaskStore";

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
    sessions: [{ id: "session-2026", startYear: 2026, endYear: 2027, label: "2026/2027", status: "open", calendarKind: "terms" }],
    periods: [{ id: "period-first", academicSessionId: "session-2026", ordinal: 1, name: "First term", kind: "term" }],
    assignments: [],
    activeSessionId: "session-2026",
    activePeriodId: "period-first",
    activeAssignmentId: "class-mathematics",
  },
};

const schemeEntry = {
  weekId: "week-1",
  weekOrdinal: 1,
  entryId: "entry-1",
  topic: "Linear equations",
  subtopic: "Inverse operations",
  curriculumUnit: { id: "unit-1", title: "Algebra" },
  curriculumOutcomes: [
    { id: "outcome-1", statement: "Solve one-step equations." },
  ],
  learningGoals: ["Solve equations accurately."],
  assessment: ["Complete an exit problem."],
  instructionalMaterials: ["Balance-scale diagram"],
};

const emptySnapshot: LessonWorkspaceSnapshot = {
  lessons: [],
  selectedLesson: null,
  availableSchemeEntries: [schemeEntry],
};

const preparationGenerator: GranularLessonGenerator = {
  prepare: vi.fn().mockRejectedValue(new Error("Preparation was not expected.")),
};
const classworkGateway = {
  getWorkspace: vi.fn().mockRejectedValue(new Error("Classwork was not expected.")),
  runGeneration: vi.fn(), regenerateSection: vi.fn(), cancelGeneration: vi.fn(),
  getFigureData: vi.fn(), editBlock: vi.fn(), approveVersion: vi.fn(),
  getSectionHistory: vi.fn(), restoreSection: vi.fn(),
} satisfies ClassworkGateway;
const noteGenerator = { writeNote: vi.fn() } satisfies LessonNoteGenerator;
const evidenceGateway = {
  getWorkspace: vi.fn().mockRejectedValue(new Error("Class results were not expected.")),
  save: vi.fn(),
} satisfies LessonEvidenceGateway;
const differentiatedClassworkGateway = {
  getWorkspace: vi.fn().mockRejectedValue(new Error("Group classwork was not expected.")),
  runGeneration: vi.fn(), cancelGeneration: vi.fn(),
} satisfies DifferentiatedClassworkGateway;

function gatewayWith(
  snapshot: LessonWorkspaceSnapshot,
  overrides: Partial<LessonPlanningGateway> = {},
): LessonPlanningGateway {
  return {
    getWorkspace: vi.fn().mockResolvedValue(snapshot),
    saveDraft: vi.fn().mockResolvedValue(snapshot),
    saveAuthoredLesson: vi.fn().mockResolvedValue(snapshot),
    getGranularProgramInput: vi.fn().mockRejectedValue(new Error("Lesson preparation was not expected.")),
    saveGranularLesson: vi.fn().mockResolvedValue(snapshot),
    confirmGranularLesson: vi.fn().mockResolvedValue(snapshot),
    moveDraft: vi.fn().mockResolvedValue(snapshot),
    discardLesson: vi.fn().mockResolvedValue(snapshot),
    saveStudentNote: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function granularRecord(): GranularLessonRecord {
  const curriculumObjective = {
    id: "curriculum-objective-1",
    statement: "Recognise and compare equivalent fractions.",
    sequence: 1,
  };
  const atomicObjective = {
    id: "atomic-objective-1",
    curriculumObjectiveId: curriculumObjective.id,
    statement: "Compare equivalent fractions using visual models.",
    bloomVerb: "compare",
    bloomLevel: "understand" as const,
    sequence: 1,
  };
  const knowledgeComponent = {
    id: "knowledge-1",
    description: "Equivalent fractions represent the same quantity.",
    knowledgeType: "concept" as const,
    bloomLevel: "understand" as const,
    atomicObjectiveIds: [atomicObjective.id],
    prerequisiteKnowledgeComponentIds: [],
    supportingRecordIds: ["source-1"],
    sourceForm: null,
    targetForm: null,
    isPriorKnowledge: false,
  };
  const lessonObjective = {
    id: "lesson-objective-1",
    statement: "Explain why one half equals two quarters.",
    sequence: 1,
    curriculumObjectiveId: curriculumObjective.id,
    atomicObjectiveId: atomicObjective.id,
    knowledgeComponentId: knowledgeComponent.id,
  };
  const sourceEvidenceSnapshot = {
    records: [
      {
        recordId: "source-1",
        title: "Equivalent fractions",
        excerpt: "One half and two quarters cover the same area.",
        excerptSha256: "a".repeat(64),
        attribution: "Curriculum source",
      },
    ],
    figures: [],
  };
  return {
    plan: {
      schemaVersion: 1,
      topic: "Equivalent fractions",
      subtopic: "Visual models",
      curriculumObjectives: [curriculumObjective],
      atomicObjectives: [atomicObjective],
      lessonObjectives: [lessonObjective],
      knowledgeComponents: [knowledgeComponent],
      misconceptions: [
        {
          id: "misconception-1",
          statement: "A larger denominator always means a larger fraction.",
          correction: "Compare the area represented, not the denominator alone.",
          knowledgeComponentIds: [knowledgeComponent.id],
          supportingRecordIds: ["source-1"],
        },
      ],
      priorKnowledge: [],
      materials: ["Fraction strips"],
      references: [
        {
          recordId: "source-1",
          title: "Equivalent fractions",
          attribution: "Curriculum source",
        },
      ],
      steps: [
        {
          id: "step-introduction",
          sequence: 1,
          role: "introduction",
          title: "Recall equal parts",
          summary: "Reconnect equal parts to familiar fraction models.",
          durationMinutes: 10,
          lessonObjectiveId: null,
          knowledgeType: null,
          teacherActivities: ["Display one whole divided into equal parts."],
          learnerActivities: ["Name the equal parts."],
          blocks: [],
        },
        {
          id: "step-core",
          sequence: 2,
          role: "core",
          title: "Compare equivalent models",
          summary: "Compare one half with two quarters.",
          durationMinutes: 30,
          lessonObjectiveId: lessonObjective.id,
          knowledgeType: "concept",
          teacherActivities: ["Align the fraction strips."],
          learnerActivities: ["Explain what the models show."],
          blocks: [
            {
              type: "explanation",
              id: "explanation-1",
              content: "Equivalent fractions name the same quantity.",
            },
            {
              type: "practice",
              id: "practice-1",
              lessonObjectiveId: lessonObjective.id,
              question: "Why does one half equal two quarters?",
              expectedAnswer: "They cover the same area.",
              hints: ["Compare the shaded area."],
            },
          ],
        },
        {
          id: "step-evaluation",
          sequence: 3,
          role: "evaluation",
          title: "Check understanding",
          summary: "Use a new model to check the learning goal.",
          durationMinutes: 10,
          lessonObjectiveId: null,
          knowledgeType: null,
          teacherActivities: ["Share the exit question."],
          learnerActivities: ["Complete the exit question."],
          blocks: [],
        },
      ],
      assessments: [
        {
          id: "assessment-1",
          lessonObjectiveId: lessonObjective.id,
          knowledgeComponentId: knowledgeComponent.id,
          question: "Show a fraction equivalent to one half.",
          expectedAnswer: "Two quarters with a matching model.",
          bloomLevel: "understand",
          rubric: ["Names an equivalent fraction", "Explains the matching quantity"],
          supportingRecordIds: ["source-1"],
        },
      ],
    },
    curriculumSnapshot: {
      packageId: "package-1",
      packageTitle: "Mathematics curriculum",
      packageSha256: "b".repeat(64),
      courseId: "course-mathematics-jss2",
      curriculumNodeId: "node-1",
      objectives: [curriculumObjective],
      atomicObjectives: [atomicObjective],
      knowledgeComponents: [knowledgeComponent],
    },
    sourceEvidenceSnapshot,
    programSnapshot: {
      programId: "lesson-plan.granular",
      programVersion: "1.0.0",
      programDigest: "c".repeat(64),
      programRunId: "run-1",
    },
  };
}

/** A confirmed lesson, the state every artifact and every deeper screen needs. */
function confirmedLesson() {
  return {
    id: "confirmed-lesson",
    academicSessionId: "session-2026",
    academicPeriodId: "period-first",
    academicPeriodName: "First term",
    teachingAssignmentId: "class-mathematics",
    schemeWeekId: null,
    schemeEntryId: null,
    inputMode: "structured" as const,
    planFormat: "legacy_import" as const,
    topic: "Linear equations",
    subtopic: null,
    rawPlan: null,
    sourcePlanText: null,
    learningGoals: ["Solve equations accurately."],
    steps: [{ id: "step", sequence: 1, title: "Solve", teacherActivity: "Model a solution.", learnerActivity: "Solve one equation.", durationMinutes: 20 }],
    instructionalMaterials: [],
    assessment: ["Exit test"],
    references: [],
    previousKnowledge: [],
    assignment: [],
    curriculumUnit: null,
    curriculumOutcomes: [],
    status: "confirmed" as const,
    latestVersionNumber: 1,
    preparation: null,
    granularRecord: null,
    answerReport: null,
  };
}

/** What the classwork screen reads for a lesson with nothing created yet. */
function classworkSnapshotFor(lesson: ReturnType<typeof confirmedLesson>) {
  return {
    lesson: {
      lessonId: lesson.id,
      lessonVersionId: "version",
      lessonVersionNumber: 1,
      subject: "Mathematics",
      grade: "JSS 2",
      topic: lesson.topic,
      subtopic: null,
      learningGoals: lesson.learningGoals,
    },
    run: null,
  };
}

describe("LessonsWorkspace", () => {
  // jsdom has no layout, so scrolling is a stub; spying on it is how a screen's
  // promise to bring work into view is checked at all.
  const scrollTo = vi.fn();
  beforeEach(() => {
    scrollTo.mockClear();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  });

  it("opens optional class results without starting classwork creation", async () => {
    const user = userEvent.setup();
    const lesson = {
      id: "confirmed-lesson",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      inputMode: "structured" as const,
      planFormat: "legacy_import" as const,
      topic: "Linear equations",
      subtopic: null,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Solve equations accurately."],
      steps: [{ id: "step", sequence: 1, title: "Solve", teacherActivity: "Model a solution.", learnerActivity: "Solve one equation.", durationMinutes: 20 }],
      instructionalMaterials: [],
      assessment: ["Exit test"],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "confirmed" as const,
      latestVersionNumber: 1,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    };
    const getClasswork = vi.fn();
    const getEvidence = vi.fn().mockResolvedValue({
      lesson: { lessonId: lesson.id, lessonVersionId: "version", lessonVersionNumber: 1, topic: lesson.topic, learningGoals: lesson.learningGoals },
      evidence: null,
    });
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={{ ...classworkGateway, getWorkspace: getClasswork }}
        noteGenerator={noteGenerator}
        evidenceGateway={{ getWorkspace: getEvidence, save: vi.fn() }}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Add class results" }));
    expect(await screen.findByRole("heading", { name: "Name the three groups you teach differently." })).toBeVisible();
    expect(getEvidence).toHaveBeenCalledOnce();
    expect(getClasswork).not.toHaveBeenCalled();
  });

  /// graspy checks its own arithmetic and gets some of it wrong. A teacher who
  /// is not told is the last line of defence without knowing it, and one who is
  /// stopped from saving cannot fix the thing being complained about.
  it("tells a teacher which answers look wrong without refusing the lesson", async () => {
    const record = granularRecord();
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith({
          lessons: [{ id: "lesson-1", topic: record.plan.topic, subtopic: record.plan.subtopic, status: "draft", inputMode: "structured", planFormat: "granular", latestVersionNumber: 0, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-09-06 09:00:00" }],
          selectedLesson: {
            id: "lesson-1",
            academicSessionId: "session-2026",
            academicPeriodId: "period-first",
            academicPeriodName: "First term",
            teachingAssignmentId: "class-mathematics",
            schemeWeekId: null,
            schemeEntryId: null,
            inputMode: "structured" as const,
            planFormat: "granular" as const,
            topic: record.plan.topic,
            subtopic: record.plan.subtopic,
            rawPlan: null,
            sourcePlanText: null,
            learningGoals: [],
            steps: [],
            instructionalMaterials: [],
            assessment: [],
            references: [],
            previousKnowledge: [],
            assignment: [],
            curriculumUnit: null,
            curriculumOutcomes: [],
            status: "draft" as const,
            latestVersionNumber: 0,
            preparation: null,
            granularRecord: record,
            answerReport: {
              checked: 4,
              unchecked: 2,
              wrong: [
                {
                  question: "Write the number 500,000,000 in words.",
                  problem: "The answer names 100,000,000, and the question asks for 500,000,000.",
                },
              ],
            },
          },
          availableSchemeEntries: [],
        })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    const notice = await screen.findByText(/One answer here looks wrong/);
    expect(notice).toBeVisible();
    expect(screen.getByText(/500,000,000/)).toBeVisible();
    expect(screen.getByText(/could not check 2 of the 7 answers/)).toBeVisible();
  });

  /// Every screen between where a way in is wired and where a teacher uses it
  /// has to pass it on. Testing the editor alone proves nothing about that, so
  /// this walks the same path a teacher walks.
  it("offers the ways in a plan can be brought in with, all the way to the editor", async () => {
    const user = userEvent.setup();
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        bringingIn={{
          documentImporter: { importPlan: vi.fn() },
          photographReader: {
            canRead: vi.fn().mockResolvedValue(true),
            readPlan: vi.fn(),
            stopReading: vi.fn(),
          },
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "New lesson" }));
    await user.click(await screen.findByRole("button", { name: /Paste a plan I already have/ }));

    expect(await screen.findByRole("button", { name: "Read a photograph of the plan" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Import from a Word file or PDF" })).toBeVisible();
  });

  /// Writing the classwork used to replace the whole screen, so the week's
  /// lessons vanished and the way back said "Back to lessons" — the third step
  /// of one job reading as somewhere else entirely.
  it("creates the classwork in the lesson's own pane, with the week still beside it", async () => {
    const user = userEvent.setup();
    const lesson = {
      id: "confirmed-lesson",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      inputMode: "structured" as const,
      planFormat: "legacy_import" as const,
      topic: "Linear equations",
      subtopic: null,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Solve equations accurately."],
      steps: [{ id: "step", sequence: 1, title: "Solve", teacherActivity: "Model a solution.", learnerActivity: "Solve one equation.", durationMinutes: 20 }],
      instructionalMaterials: [],
      assessment: ["Exit test"],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "confirmed" as const,
      latestVersionNumber: 1,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    };
    const getClasswork = vi.fn().mockResolvedValue({
      lesson: {
        lessonId: lesson.id,
        lessonVersionId: "version",
        lessonVersionNumber: 1,
        subject: "Mathematics",
        grade: "JSS 2",
        topic: lesson.topic,
        subtopic: null,
        learningGoals: lesson.learningGoals,
      },
      run: null,
    });
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={{ ...classworkGateway, getWorkspace: getClasswork }}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    const week = await screen.findByRole("navigation", { name: "Lessons in this class and term" });
    await user.click(await screen.findByRole("button", { name: "Open the classwork" }));

    expect(await screen.findByRole("button", { name: "Create the classwork" })).toBeVisible();
    // The whole point: the lesson never left the screen.
    expect(week).toBeVisible();
    expect(within(week).getByText("Linear equations")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back to lessons" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to the lesson" }));
    expect(await screen.findByRole("button", { name: "Add class results" })).toBeVisible();
    expect(week).toBeVisible();
  });

  /// The actions a lesson leads to sat inside the Plan tab's own panel, so
  /// switching to the Note unmounted them: a teacher reading the note had no
  /// way to open the classwork or add results without going back to the plan.
  it("keeps what the lesson leads to reachable from either of its documents", async () => {
    const user = userEvent.setup();
    const lesson = confirmedLesson();
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    };
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    expect(await screen.findByRole("button", { name: "Open the classwork" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Note" }));

    expect(screen.getByRole("button", { name: "Open the classwork" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add class results" })).toBeVisible();

    // They sit under both documents rather than inside one, so the tab panel
    // does not contain them.
    const notePanel = screen.getByRole("tabpanel");
    expect(
      within(notePanel).queryByRole("button", { name: "Open the classwork" }),
    ).toBeNull();
  });

  it("writes the student note from the plan under the Note tab and keeps it", async () => {
    const user = userEvent.setup();
    const lesson = {
      id: "confirmed-lesson",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      inputMode: "structured" as const,
      planFormat: "legacy_import" as const,
      topic: "Linear equations",
      subtopic: null,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Solve equations accurately."],
      steps: [{ id: "step", sequence: 1, title: "Solve", teacherActivity: "Model a solution.", learnerActivity: "Solve one equation.", durationMinutes: 20 }],
      instructionalMaterials: [],
      assessment: ["Exit test"],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "confirmed" as const,
      latestVersionNumber: 4,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 4, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    };
    const saveStudentNote = vi.fn().mockResolvedValue(undefined);
    const writeNote = vi.fn().mockResolvedValue({
      paragraphs: ["An equation balances two sides.", "To solve it, keep both sides equal while you simplify.", "The value that keeps the balance is the solution."],
      writtenFromVersion: 4,
    });
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot, { saveStudentNote })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={{ writeNote }}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Note" }));
    expect(await screen.findByText("No student note yet")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Generate from plan" }));

    expect(await screen.findByText("To solve it, keep both sides equal while you simplify.")).toBeVisible();
    expect(writeNote).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: lesson.id,
        writtenFromVersion: 4,
        topic: "Linear equations",
        learningGoals: lesson.learningGoals,
        steps: [
          {
            title: "Solve",
            summary: "Model a solution. Solve one equation.",
            taught: [],
            workedExamples: [],
            practice: [],
          },
        ],
      }),
      expect.any(AbortSignal),
    );
    expect(saveStudentNote).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: lesson.id, note: expect.objectContaining({ writtenFromVersion: 4 }) }),
    );
  });

  it("exports the plan for approval as a chosen PDF", async () => {
    const user = userEvent.setup();
    const lesson = {
      id: "confirmed-lesson",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      inputMode: "structured" as const,
      planFormat: "legacy_import" as const,
      topic: "Linear equations",
      subtopic: null,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Solve equations accurately."],
      steps: [{ id: "step", sequence: 1, title: "Solve", teacherActivity: "Model a solution.", learnerActivity: "Solve one equation.", durationMinutes: 20 }],
      instructionalMaterials: ["Worked examples"],
      assessment: ["Exit test"],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "confirmed" as const,
      latestVersionNumber: 1,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    };
    const choosePdfDestination = vi.fn().mockResolvedValue("/tmp/linear-equations-plan.pdf");
    const savePdf = vi.fn().mockResolvedValue({ path: "/tmp/linear-equations-plan.pdf", fileName: "linear-equations-plan.pdf", byteSize: 4096 });
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        planExportGateway={{ choosePdfDestination, savePdf, print: vi.fn() }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Save a PDF to sign" }));

    expect(await screen.findByText("Lesson plan exported")).toBeVisible();
    expect(choosePdfDestination).toHaveBeenCalledWith("linear-equations-plan.pdf");
    expect(savePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationPath: "/tmp/linear-equations-plan.pdf",
        document: expect.objectContaining({
          eyebrow: "Lesson",
          title: "Linear equations",
          identity: { week: null, className: "JSS 2A", subject: "Mathematics", period: null, duration: "20 minutes" },
          objectives: lesson.learningGoals,
          instructionalMaterials: lesson.instructionalMaterials,
          evaluation: lesson.assessment,
          steps: [{ title: "Solve", teacherActivity: "Model a solution.", learnerActivity: "Solve one equation.", durationMinutes: 20 }],
        }),
      }),
    );
  });

  /// The heading above the list says "This week", so the list beneath it reads
  /// as the week's unless it says otherwise. It is the term's, and it holds
  /// both the lessons a teacher has written and the weekly plans they have not.
  it("says the list beside a lesson is the term's, not the week's", async () => {
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(unscheduledSnapshot())}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    const week = await screen.findByRole("navigation", {
      name: "Lessons in this class and term",
    });
    expect(within(week).getByText("Every lesson this term")).toBeVisible();
  });

  it("replaces the lesson while it is written, and leaves the week reachable", async () => {
    const user = userEvent.setup();
    const beingWritten = {
      id: "lesson-being-written",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      inputMode: "structured" as const,
      planFormat: "legacy_import" as const,
      topic: "Rounding whole numbers",
      subtopic: null,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Round to the nearest ten."],
      steps: [],
      instructionalMaterials: [],
      assessment: [],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "draft" as const,
      latestVersionNumber: 0,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [
        {
          id: beingWritten.id, topic: beingWritten.topic, subtopic: null,
          status: "draft", inputMode: "structured", planFormat: "legacy_import",
          latestVersionNumber: 0, weekOrdinal: null,
          schemeEntryId: null, classworkComplete: false,
          startedAt: "2026-07-21 13:53:35",
        },
      ],
      selectedLesson: beingWritten,
      availableSchemeEntries: [],
    };
    // Held open so the lesson stays mid-run for the assertions.
    const stillWriting = { prepare: vi.fn(() => new Promise(() => {})) };
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot, {
          getGranularProgramInput: vi.fn().mockResolvedValue({
            topic: beingWritten.topic, subtopic: null, teacherSource: null,
            learningGoals: beingWritten.learningGoals, lessonDurationMinutes: 40,
          }),
        })}
        preparationGenerator={stillWriting as unknown as GranularLessonGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    // The lesson has no plan yet, so drafting it with graspy prepares it there
    // and then — no form in between.
    await user.click(await screen.findByRole("button", { name: /Let graspy draft it/ }));
    await screen.findByText("Preparing your lesson");

    // Writing replaces the lesson rather than sitting under it: none of the
    // sections the run is filling are on the page to be read half-empty.
    expect(screen.queryByRole("heading", { name: "Learning goals" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Lesson steps" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Materials" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Assessment" })).toBeNull();

    // The task bar tells a teacher the work carries on elsewhere, so elsewhere
    // has to still exist. Taking the whole screen removed it.
    expect(screen.getByRole("button", { name: /New lesson/ })).toBeVisible();

    // Drafting is chosen from a panel well down the lessons page, so the run
    // has to be brought back into view rather than left below the fold.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  /// A refused save has to change the part of the screen the teacher is looking
  /// at. Reported at the top of a long form it changed nothing they could see,
  /// and reading a button as dead is what hid the one-lesson-per-plan refusal.
  it("says a save was refused beside the button that asked for it", async () => {
    const user = userEvent.setup();
    const saveDraft = vi
      .fn()
      .mockRejectedValue("This weekly plan already has a lesson. Open that lesson instead.");
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot, { saveDraft })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        arrivedFrom={{ launch: { schemeWeekId: "week-1", schemeEntryId: "entry-1" } }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Save without writing" }));

    const refusal = await screen.findByText("Draft not saved");
    expect(
      screen.getByText("This weekly plan already has a lesson. Open that lesson instead."),
    ).toBeVisible();
    expect(refusal.closest("[aria-live]")).toContainElement(
      screen.getByRole("button", { name: "Save without writing" }),
    );
  });

  it("builds the lesson from a weekly plan without asking the teacher to write it", async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn().mockResolvedValue({
      ...emptySnapshot,
      lessons: [
        {
          id: "lesson-written",
          topic: "Linear equations",
          subtopic: null,
          status: "draft" as const,
          inputMode: "structured" as const,
          planFormat: "granular" as const,
          latestVersionNumber: 0,
          weekOrdinal: 1,
        },
      ],
    });
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot, { saveDraft })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        arrivedFrom={{ launch: { schemeWeekId: "week-1", schemeEntryId: "entry-1" } }}
      />,
    );

    // The plan supplies topic and goals, so nothing is left to type, and the
    // primary action builds the lesson rather than asking the teacher to write it.
    expect(await screen.findByDisplayValue("Linear equations")).toBeVisible();
    expect(screen.getByRole("button", { name: "Write it with graspy" })).toBeVisible();

    // Building starts by asking for the lesson's program input, so that call
    // is the first observable evidence it began at all.
    const askedToBuild = vi.fn().mockRejectedValue(new Error("stop after the ask"));
    cleanup();
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot, { saveDraft, getGranularProgramInput: askedToBuild })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        arrivedFrom={{ launch: { schemeWeekId: "week-1", schemeEntryId: "entry-1" } }}
      />,
    );
    await screen.findByDisplayValue("Linear equations");

    await user.click(screen.getByRole("button", { name: "Save without writing" }));
    expect(askedToBuild, "saving for later does not build").not.toHaveBeenCalled();

    cleanup();
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot, { saveDraft, getGranularProgramInput: askedToBuild })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        arrivedFrom={{ launch: { schemeWeekId: "week-1", schemeEntryId: "entry-1" } }}
      />,
    );
    await screen.findByDisplayValue("Linear equations");

    await user.click(screen.getByRole("button", { name: "Write it with graspy" }));
    await waitFor(() => expect(askedToBuild).toHaveBeenCalled());
    expect(askedToBuild.mock.calls[0][0]).toMatchObject({ lessonId: "lesson-written" });
  });

  it("starts from a weekly plan and keeps the inherited academic context visible", async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn().mockResolvedValue(emptySnapshot);
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot, { saveDraft })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        arrivedFrom={{ launch: { schemeWeekId: "week-1", schemeEntryId: "entry-1" } }}
      />,
    );

    expect(
      await screen.findByText(/Mathematics · JSS 2 · A · 2026\/2027/),
    ).toBeVisible();
    expect(screen.getByDisplayValue("Linear equations")).toBeVisible();
    expect(screen.getByDisplayValue("Solve equations accurately.")).toBeVisible();
    await user.type(screen.getByLabelText("Step title"), "Model the method");
    await user.type(
      screen.getByLabelText("Teacher activity"),
      "Model one equation using a balance.",
    );
    await user.type(
      screen.getByLabelText("Learner activity"),
      "Explain each inverse operation.",
    );
    await user.click(screen.getByRole("button", { name: "Save without writing" }));

    expect(saveDraft).toHaveBeenCalledWith({
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        teachingAssignmentId: "class-mathematics",
      },
      lessonId: null,
      schemeWeekId: "week-1",
      schemeEntryId: "entry-1",
      inputMode: "structured",
      topic: "Linear equations",
      subtopic: "Inverse operations",
      rawPlan: null,
      learningGoals: ["Solve equations accurately."],
      steps: [
        {
          title: "Model the method",
          teacherActivity: "Model one equation using a balance.",
          learnerActivity: "Explain each inverse operation.",
          durationMinutes: null,
        },
      ],
      instructionalMaterials: ["Balance-scale diagram"],
      previousKnowledge: [],
      assessment: ["Complete an exit problem."],
      assignment: [],
      references: [],
    });
  });

  it("stores pasted lesson text without silently structuring it", async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn().mockResolvedValue(emptySnapshot);
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot, { saveDraft })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "New lesson" }));
    await user.click(await screen.findByRole("button", { name: /Paste a plan I already have/ }));
    await user.type(screen.getByLabelText("Lesson topic"), "Fractions");
    await user.type(
      screen.getByLabelText("Lesson plan text"),
      "Teacher demonstrates one half and two quarters.",
    );
    await user.click(screen.getByRole("button", { name: "Save without writing" }));

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        inputMode: "pasted",
        topic: "Fractions",
        rawPlan: "Teacher demonstrates one half and two quarters.",
        learningGoals: [],
        steps: [],
        instructionalMaterials: [],
        assessment: [],
        references: [],
      }),
    );
    expect(screen.queryByText(/automatically extracted/i)).not.toBeInTheDocument();
  });

  it("does not silently detach an unavailable weekly plan", async () => {
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith({ ...emptySnapshot, availableSchemeEntries: [] })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        arrivedFrom={{ launch: { schemeWeekId: "missing-week", schemeEntryId: "missing-entry" } }}
      />,
    );

    expect(await screen.findByText("Weekly plan unavailable")).toBeVisible();
    expect(screen.queryByLabelText("Lesson topic")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to lessons" })).toBeVisible();
  });

  it("assigns an unscheduled draft to a teaching week later", async () => {
    const user = userEvent.setup();
    const unscheduledLesson = {
      id: "lesson-unscheduled",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      inputMode: "structured" as const,
      planFormat: "legacy_import" as const,
      topic: "Fractions",
      subtopic: null,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Compare equivalent fractions."],
      steps: [
        {
          id: "step-1",
          sequence: 1,
          title: "Compare models",
          teacherActivity: "Model two equivalent fractions.",
          learnerActivity: "Compare the models.",
          durationMinutes: 20,
        },
      ],
      instructionalMaterials: ["Fraction strips"],
      assessment: ["Explain one equivalent pair."],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "draft" as const,
      latestVersionNumber: 0,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [
        {
          id: unscheduledLesson.id,
          topic: unscheduledLesson.topic,
          subtopic: null,
          status: "draft",
          inputMode: "structured",
          planFormat: "legacy_import",
          latestVersionNumber: 0,
          weekOrdinal: null,
          schemeEntryId: null, classworkComplete: false,
          startedAt: "2026-07-21 13:53:35",
        },
      ],
      selectedLesson: unscheduledLesson,
      availableSchemeEntries: [schemeEntry],
    };
    const saveDraft = vi.fn().mockResolvedValue(snapshot);
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot, { saveDraft })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Edit the starting plan" }));
    await user.selectOptions(
      screen.getByLabelText("Weekly plan (optional)"),
      "entry-1",
    );
    await user.click(screen.getByRole("button", { name: "Save without writing" }));

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: "lesson-unscheduled",
        schemeWeekId: "week-1",
        schemeEntryId: "entry-1",
      }),
    );
  });

  function unscheduledSnapshot(): LessonWorkspaceSnapshot {
  return {
      lessons: [
        {
          id: "lesson-unscheduled",
          topic: "Fractions",
          subtopic: null,
          status: "draft",
          inputMode: "structured",
          planFormat: "legacy_import",
          latestVersionNumber: 0,
          weekOrdinal: null,
          schemeEntryId: null, classworkComplete: false,
          startedAt: "2026-07-21 13:53:35",
        },
      ],
      selectedLesson: {
        id: "lesson-unscheduled",
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        academicPeriodName: "First term",
        teachingAssignmentId: "class-mathematics",
        schemeWeekId: null,
        schemeEntryId: null,
        inputMode: "structured" as const,
        planFormat: "legacy_import" as const,
        topic: "Fractions",
        subtopic: null,
        rawPlan: null,
        sourcePlanText: null,
        learningGoals: ["Compare equivalent fractions."],
        steps: [],
        instructionalMaterials: [],
        assessment: [],
        references: [],
        previousKnowledge: [],
        assignment: [],
        curriculumUnit: null,
        curriculumOutcomes: [],
        status: "draft" as const,
        latestVersionNumber: 0,
        preparation: null,
        granularRecord: null,
        answerReport: null,
      },
      availableSchemeEntries: [schemeEntry],
  };
  }

  it("prepares an unscheduled lesson from its own learning goals", async () => {
    const snapshot = unscheduledSnapshot();

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    // The lesson has no plan yet, and it says what its learners should be able
    // to do, so graspy can draft one directly from those goals.
    expect(await screen.findByText("This lesson has no plan yet")).toBeVisible();
    expect(screen.getByRole("button", { name: /Let graspy draft it/ })).toBeVisible();
  });

  it("asks an unscheduled lesson with no learning goals for one", async () => {
    const user = userEvent.setup();
    const snapshot: LessonWorkspaceSnapshot = {
      ...unscheduledSnapshot(),
      selectedLesson: { ...unscheduledSnapshot().selectedLesson!, learningGoals: [] },
    };

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    // The three routes still appear, but with no goals to draft from, choosing
    // to draft opens the editor to supply them rather than preparing an empty
    // lesson.
    expect(await screen.findByText("This lesson has no plan yet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Let graspy draft it/ }));
    expect(screen.getByLabelText("Weekly plan (optional)")).toBeVisible();
  });

  it("keeps the original visible while the teacher edits and confirms a detailed lesson", async () => {
    const user = userEvent.setup();
    const rawPlan =
      "Teacher demonstrates one half and two quarters.\nLearners compare both models.";
    const record = granularRecord();
    const pastedLesson = {
      id: "lesson-pasted",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: "week-1",
      schemeEntryId: "entry-1",
      inputMode: "pasted" as const,
      planFormat: "legacy_import" as const,
      topic: "Fractions",
      subtopic: null,
      rawPlan,
      sourcePlanText: null,
      learningGoals: [],
      steps: [],
      instructionalMaterials: [],
      assessment: [],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "draft" as const,
      latestVersionNumber: 0,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const initialSnapshot: LessonWorkspaceSnapshot = {
      lessons: [
        {
          id: pastedLesson.id,
          topic: pastedLesson.topic,
          subtopic: null,
          status: "draft",
          inputMode: "pasted",
          planFormat: "legacy_import",
          latestVersionNumber: 0,
          weekOrdinal: null,
          schemeEntryId: null, classworkComplete: false,
          startedAt: "2026-07-21 13:53:35",
        },
      ],
      selectedLesson: pastedLesson,
      availableSchemeEntries: [schemeEntry],
    };
    const preparedSnapshot: LessonWorkspaceSnapshot = {
      ...initialSnapshot,
      selectedLesson: {
        ...pastedLesson,
        preparation: {
          lessonId: pastedLesson.id,
          sourceRawPlan: rawPlan,
          topic: record.plan.topic,
          subtopic: record.plan.subtopic,
          learningGoals: record.plan.lessonObjectives.map(({ statement }) => statement),
          steps: record.plan.steps.map((step) => ({
            id: step.id,
            sequence: step.sequence,
            title: step.title,
            teacherActivity: step.teacherActivities.join("\n"),
            learnerActivity: step.learnerActivities.join("\n"),
            durationMinutes: step.durationMinutes,
          })),
          instructionalMaterials: record.plan.materials,
          previousKnowledge: record.plan.priorKnowledge.map(({ statement }) => statement),
          assessment: record.plan.assessments.map(({ question }) => question),
          references: record.plan.references.map(({ title }) => title),
          planFormat: "granular",
          granularRecord: record,
          answerReport: null,
        },
      },
    };
    const generator: GranularLessonGenerator = {
      prepare: vi.fn().mockResolvedValue(record),
    };
    const programInput = {
      topic: pastedLesson.topic,
      subtopic: pastedLesson.subtopic,
      teacherSource: rawPlan,
      lessonDurationMinutes: 50,
      curriculumSnapshot: record.curriculumSnapshot,
      sourceEvidenceSnapshot: record.sourceEvidenceSnapshot,
    };
    const getGranularProgramInput = vi.fn().mockResolvedValue(programInput);
    const saveGranularLesson = vi.fn().mockResolvedValue(preparedSnapshot);
    const openClasswork = vi.fn().mockResolvedValue({
      lesson: {
        lessonId: "lesson-pasted",
        lessonVersionId: "version",
        lessonVersionNumber: 1,
        subject: "Mathematics",
        grade: "JSS 2",
        topic: "Fractions",
        subtopic: null,
        learningGoals: ["Compare equivalent fractions."],
      },
      run: null,
      sources: [],
    });
    let settled = false;
    const confirmGranularLesson = vi.fn().mockImplementation(() => {
      settled = true;
      return Promise.resolve({ ...preparedSnapshot, selectedLesson: null });
    });
    // Confirming answers with the week rather than the lesson, so the screen
    // reads the lesson back — and once it is confirmed, that read gives a
    // confirmed lesson rather than the draft it was a moment earlier.
    const confirmedSnapshot = {
      ...preparedSnapshot,
      selectedLesson: {
        ...preparedSnapshot.selectedLesson,
        status: "confirmed",
        latestVersionNumber: 1,
      },
    } as unknown as LessonWorkspaceSnapshot;
    // The backend persists the prepared record itself; the screen re-reads the
    // lesson afterwards, so the workspace answers prepared once it is asked
    // for that lesson by name.
    const getWorkspace = vi.fn().mockImplementation(({ selectedLessonId }) => {
      if (selectedLessonId !== pastedLesson.id) return Promise.resolve(initialSnapshot);
      return Promise.resolve(settled ? confirmedSnapshot : preparedSnapshot);
    });

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(initialSnapshot, {
          getWorkspace,
          getGranularProgramInput,
          saveGranularLesson,
          confirmGranularLesson,
        })}
        preparationGenerator={generator}
        classworkGateway={{ ...classworkGateway, getWorkspace: openClasswork }}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Prepare lesson" }),
    );
    expect(getGranularProgramInput).toHaveBeenCalledWith({
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        teachingAssignmentId: "class-mathematics",
      },
      lessonId: "lesson-pasted",
      lessonDurationMinutes: 50,
    });
    expect(generator.prepare).toHaveBeenCalledWith(
      {
        context: {
          academicSessionId: "session-2026",
          academicPeriodId: "period-first",
          teachingAssignmentId: "class-mathematics",
        },
        lessonId: "lesson-pasted",
        input: programInput,
      },
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(
      await screen.findByText(
        (_, element) => element?.tagName === "PRE" && element.textContent === rawPlan,
      ),
    ).toBeVisible();
    // The lesson leads with its subtopic, as the design does, with the topic as
    // the eyebrow above it.
    expect(
      screen.getByRole("heading", { name: "Visual models" }),
    ).toBeVisible();
    expect(
      screen.getByText("Equivalent fractions", { selector: "header p" }),
    ).toBeVisible();
    expect(
      screen.getByText("Prepared — review before you confirm.", { exact: false }),
    ).toBeVisible();

    // The prepared lesson is read first; editing is a deliberate step, and
    // nothing is a form field until the teacher asks for one.
    expect(screen.getByLabelText("Goal 1")).not.toBeVisible();
    // Reading offers confirm and edit; editing offers confirm and save. Both
    // rendered at once and every assertion still passed, because getByRole
    // finds the first match and neither bar is wrong on its own.
    expect(screen.getAllByRole("button", { name: "Confirm lesson" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    // A prepared lesson can be re-drafted, keeping what is there until a new one lands.
    expect(screen.getByRole("button", { name: "Re-draft with graspy" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Edit lesson" }));

    expect(screen.getAllByRole("button", { name: "Confirm lesson" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
    expect(screen.getByLabelText("Goal 1")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add learning goal" }));
    expect(screen.getByLabelText("Goal 2")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Remove learning goal 2" }),
    );
    expect(screen.queryByLabelText("Goal 2")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Add teaching step for goal 1" }),
    );
    expect(screen.getByLabelText("Step 3 title")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Remove lesson step 3" }),
    );
    expect(screen.getByLabelText("Step 3 title")).toHaveValue(
      "Check understanding",
    );

    await user.click(
      screen.getByRole("button", { name: "Add explanation to lesson step 2" }),
    );
    expect(screen.getByLabelText("Step 2 explanation 3")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Remove content 3 from lesson step 2",
      }),
    );
    expect(screen.queryByLabelText("Step 2 explanation 3")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Add question for goal 1" }),
    );
    expect(screen.getByLabelText("Question 2")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Remove question 2" }),
    );
    expect(screen.queryByLabelText("Question 2")).not.toBeInTheDocument();

    const learningGoal = screen.getByLabelText("Goal 1");
    await user.clear(learningGoal);
    await user.type(
      learningGoal,
      "Show and explain why one half equals two quarters.",
    );
    await user.click(screen.getByRole("button", { name: "Confirm lesson" }));

    expect(saveGranularLesson).toHaveBeenLastCalledWith({
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        teachingAssignmentId: "class-mathematics",
      },
      lessonId: "lesson-pasted",
      record: expect.objectContaining({
        plan: expect.objectContaining({
          lessonObjectives: [
            expect.objectContaining({
              statement: "Show and explain why one half equals two quarters.",
            }),
          ],
        }),
      }),
    });
    expect(confirmGranularLesson).toHaveBeenCalledWith({
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period-first",
        teachingAssignmentId: "class-mathematics",
      },
      lessonId: "lesson-pasted",
    });

    // Confirming ends where the next step is offered, rather than dropping the
    // teacher on the lesson list to find this lesson again. The progress strip
    // names the same step, so this is the banner's own control.
    const banner = await screen.findByRole("region", { name: /Next, graspy writes/ });
    const createClasswork = within(banner).getByRole("button", {
      name: "Create the classwork",
    });
    expect(screen.getByText("Lesson confirmed")).toBeVisible();

    // Choosing it opens the classwork for this very lesson — the same command
    // the lesson list calls, reached without going back through the list.
    await user.click(createClasswork);
    await waitFor(() =>
      expect(openClasswork).toHaveBeenCalledWith(
        expect.objectContaining({ lessonId: "lesson-pasted" }),
      ),
    );
  });

  /// The confirmation belongs to the lesson it was given for. Opening another
  /// lesson clears the entry being planned but not the confirmation — only
  /// choosing what to do next does that — so a banner that asked merely whether
  /// one existed would follow the teacher onto a lesson they never confirmed
  /// and congratulate them on it.
  it("leaves the confirmation with the lesson it was confirmed for", async () => {
    const user = userEvent.setup();
    const record = granularRecord();
    const preparedLesson = {
      id: "lesson-prepared",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      inputMode: "structured" as const,
      planFormat: "granular" as const,
      topic: record.plan.topic,
      subtopic: record.plan.subtopic,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: [],
      steps: [],
      instructionalMaterials: [],
      assessment: [],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "draft" as const,
      latestVersionNumber: 0,
      preparation: null,
      granularRecord: record,
      answerReport: null,
    };
    // What confirming leaves: the same lesson, settled, carrying the plan that
    // was approved — so the pane reads it as a lesson rather than a review.
    const settledLesson = {
      ...preparedLesson,
      status: "confirmed" as const,
      latestVersionNumber: 1,
      learningGoals: record.plan.lessonObjectives.map(({ statement }) => statement),
      steps: record.plan.steps.map((step) => ({
        id: step.id,
        sequence: step.sequence,
        title: step.title,
        teacherActivity: step.teacherActivities.join("\n"),
        learnerActivity: step.learnerActivities.join("\n"),
        durationMinutes: step.durationMinutes,
      })),
    };
    // The lesson to move to has a plan of its own, so opening it lands on the
    // lesson screen — the one screen the banner can appear on at all.
    const otherLesson = confirmedLesson();
    let settled = false;
    const snapshotFor = (selectedLessonId: string | null): LessonWorkspaceSnapshot => ({
      lessons: [
        {
          id: preparedLesson.id,
          topic: preparedLesson.topic,
          subtopic: preparedLesson.subtopic,
          status: settled ? "confirmed" : "draft",
          inputMode: "structured",
          planFormat: "granular",
          latestVersionNumber: settled ? 1 : 0,
          weekOrdinal: null,
          schemeEntryId: null, classworkComplete: false,
          startedAt: "2026-07-21 13:53:35",
        },
        {
          id: otherLesson.id,
          topic: otherLesson.topic,
          subtopic: null,
          status: "confirmed",
          inputMode: "structured",
          planFormat: "legacy_import",
          latestVersionNumber: 1,
          weekOrdinal: null,
          schemeEntryId: null, classworkComplete: false,
          startedAt: "2026-07-21 13:53:35",
        },
      ],
      selectedLesson:
        selectedLessonId === otherLesson.id
          ? otherLesson
          : settled
            ? settledLesson
            : preparedLesson,
      availableSchemeEntries: [],
    });
    const getWorkspace = vi.fn(({ selectedLessonId }: LessonWorkspaceRequest) =>
      Promise.resolve(snapshotFor(selectedLessonId)),
    );
    const confirmGranularLesson = vi.fn(() => {
      settled = true;
      return Promise.resolve(snapshotFor(preparedLesson.id));
    });
    // The week list is rebuilt whenever a lesson is read, so it is asked for
    // again rather than held across a load.
    const lessonInTheWeek = async (name: RegExp) =>
      within(
        await screen.findByRole("navigation", { name: "Lessons in this class and term" }),
      ).getByRole("button", { name });

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshotFor(null), { getWorkspace, confirmGranularLesson })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Confirm lesson" }));
    expect(await screen.findByText("Lesson confirmed")).toBeVisible();

    await user.click(await lessonInTheWeek(/Linear equations/));

    // The other lesson is genuinely open — so the banner is absent because it
    // belongs elsewhere, not because there is no lesson to sit above. The list
    // names the topic too, so the heading is looked for outside the list.
    const openLesson = await screen.findByRole("region", { name: "The lesson you are reading" });
    expect(within(openLesson).getByRole("heading", { name: "Linear equations" })).toBeVisible();
    expect(screen.queryByText("Lesson confirmed")).toBeNull();

    // And it is waiting where it was left: leaving the lesson did not spend it.
    await user.click(await lessonInTheWeek(/Visual models/));
    expect(await screen.findByText("Lesson confirmed")).toBeVisible();
  });

  it("offers the three ways to start rather than a box that assumes generation", async () => {
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    // A teacher arrives with a class to teach, and the screen offers the ways to
    // begin — not a single prompt that starts a generation the moment they type.
    expect(await screen.findByRole("heading", { name: "Start a lesson" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Write it myself/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Let graspy draft it/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Paste a plan I already have/ })).toBeVisible();
  });

  it("opens an empty plan to write by hand, not a generation run, from the blank route", async () => {
    const user = userEvent.setup();
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /Write it myself/ }));

    // Writing it by hand is authoring, not generation: a draft to save, and no
    // Write it with graspy anywhere on the screen.
    expect(await screen.findByRole("button", { name: "Save draft" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Write it with graspy" }),
    ).not.toBeInTheDocument();
  });

  it("drafts with graspy from the draft route", async () => {
    const user = userEvent.setup();
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /Let graspy draft it/ }));

    expect(
      await screen.findByRole("button", { name: "Write it with graspy" }),
    ).toBeVisible();
  });

  it("takes a lesson plan a teacher already has, from the bring-your-own route", async () => {
    const user = userEvent.setup();
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(emptySnapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /Paste a plan I already have/ }));

    // Their own words go in verbatim, kept as written so they can be read back
    // before anything is confirmed — not flattened into a topic field.
    expect(await screen.findByLabelText("Lesson plan text")).toBeVisible();
  });

  /// The week is what a teacher is offered first, because it is what they
  /// write. Taking one subtopic instead is the other half of that choice, and
  /// it has to be said out loud — reaching it by planning a subtopic before the
  /// week is not a choice anyone would find.
  it("lets a teacher take one subtopic instead of the whole week", async () => {
    const user = userEvent.setup();
    const second = { ...schemeEntry, entryId: "entry-2", subtopic: "Balancing equations" };
    const snapshot = { ...emptySnapshot, availableSchemeEntries: [schemeEntry, second] };
    const saveDraft = vi.fn().mockResolvedValue(snapshot);

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot, { saveDraft })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    const list = await screen.findByRole("navigation", { name: /Lessons in this class/ });
    await user.click(within(list).getByRole("button", { name: new RegExp(schemeEntry.topic) }));
    expect(await screen.findByText("This week has no plan yet")).toBeVisible();

    await user.click(screen.getByRole("button", { name: second.subtopic }));

    // Narrowed to that subtopic, so the plan is bound to the entry rather than
    // the week — which is what makes it a different lesson to sign.
    expect(await screen.findByText("This lesson has no plan yet")).toBeVisible();
    expect(screen.getByRole("heading", { name: second.subtopic })).toBeVisible();
  });

  it("starts a lesson from a weekly plan the teacher already wrote", async () => {
    const user = userEvent.setup();
    const snapshot = { ...emptySnapshot, availableSchemeEntries: [schemeEntry] };
    const saveDraft = vi.fn().mockResolvedValue({
      ...snapshot,
      lessons: [
        {
          id: "lesson-drafted",
          topic: schemeEntry.topic,
          subtopic: schemeEntry.subtopic,
          status: "draft" as const,
          inputMode: "structured" as const,
          planFormat: "legacy_import" as const,
          latestVersionNumber: 0,
          weekOrdinal: 1,
          schemeEntryId: schemeEntry.entryId,
        },
      ],
    });
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot, { saveDraft })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    // A week nobody has written for is one row — one plan is what a teacher
    // writes for it — and it opens on the ways to write that plan.
    const list = await screen.findByRole("navigation", {
      name: /Lessons in this class/,
    });
    await user.click(within(list).getByRole("button", { name: new RegExp(schemeEntry.topic) }));
    // The week, and the screen says so — with the subtopics that one plan will
    // cover, so the rest of the week is not left unaccounted for.
    expect(await screen.findByText("This week has no plan yet")).toBeVisible();
    expect(
      screen.getByText(new RegExp(`One plan for the week, covering.*${schemeEntry.subtopic}`)),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Let graspy draft it/ }));

    // Drafting writes the scheme's lesson and prepares it directly — the goals
    // come from the week, so there is no form to fill.
    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith(
        // The week's plan, written against what that week commits to.
        expect.objectContaining({
          schemeWeekId: schemeEntry.weekId,
          schemeEntryId: null,
          learningGoals: schemeEntry.learningGoals,
        }),
      ),
    );
  });

  it("shows the work a lesson already has in hand instead of offering to start it again", async () => {
    const rawPlan = "Topic: Equivalent fractions\nSteps: compare halves and quarters";
    const pastedLesson = {
      id: "lesson-pasted",
      academicSessionId: "session-2026",
      academicPeriodId: "period-first",
      academicPeriodName: "First term",
      teachingAssignmentId: "class-mathematics",
      schemeWeekId: null,
      schemeEntryId: null,
      weekStartDate: null,
      topic: "Equivalent fractions",
      subtopic: null,
      learningGoals: [],
      steps: [],
      instructionalMaterials: [],
      assessment: [],
      references: [],
      status: "draft" as const,
      inputMode: "pasted" as const,
      planFormat: "legacy_import" as const,
      rawPlan,
      curriculumNodeIds: [],
      version: 1,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot = {
      ...emptySnapshot,
      lessons: [pastedLesson],
      selectedLesson: pastedLesson,
    } as unknown as LessonWorkspaceSnapshot;

    const queued = {
      id: "task-queued",
      kind: "lesson_preparation",
      lessonId: pastedLesson.id,
      label: "Preparing Equivalent fractions",
      status: "queued" as const,
      queuePosition: 2,
      failureMessage: null,
      startedAt: "2026-07-28 10:00:00",
      updatedAt: "2026-07-28 10:00:00",
      finishedAt: null,
      dismissedAt: null,
    };
    const taskStore = new BackgroundTaskStore({
      list: vi.fn().mockResolvedValue([queued]),
      get: vi.fn().mockResolvedValue(queued),
      cancel: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      onChanged: vi.fn().mockResolvedValue(() => undefined),
    });

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        taskStore={taskStore}
      />,
    );

    await screen.findByText("Waiting for the lesson engine — number 2 in line.");
    expect(
      screen.queryByRole("button", { name: "Prepare lesson" }),
    ).not.toBeInTheDocument();
    taskStore.close();
  });

  /// A teacher lands on their work, not an empty prompt. Never pinned before,
  /// which is how extracting the effect that does it broke it silently.
  it("opens this week's lesson on arrival rather than asking which to open", async () => {
    const lesson = confirmedLesson();
    const load = vi.fn();
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [
        { id: "other", topic: "Fractions", subtopic: null, status: "draft", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: 9, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" },
        { id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: 1, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" },
      ],
      selectedLesson: null,
      availableSchemeEntries: [],
    };
    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={{ ...gatewayWith(snapshot), getWorkspace: vi.fn(async (request) => {
          if (request.selectedLessonId) load(request.selectedLessonId);
          return snapshot;
        }) }}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    // With no week scheduled, the list's first lesson is the one to land on.
    await waitFor(() => expect(load).toHaveBeenCalledWith("other"));
  });

  /// A link naming a lesson wins over the screen's own opening read, however
  /// the two answer. Both go out on arrival, and the term plan's "Open lesson"
  /// landed on a different lesson entirely when the unnamed one answered last.
  it("opens the lesson a link names even when the screen's own read answers later", async () => {
    // The rail is named apart from the pane so the assertion can only be about
    // which lesson the pane settled on.
    const lessons = [
      { id: "millions", topic: "First in the rail", subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: 1, schemeEntryId: "entry-1" },
      { id: "trillions", topic: "Second in the rail", subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: 1, schemeEntryId: "entry-3" },
    ] as LessonWorkspaceSnapshot["lessons"];
    const snapshotSelecting = (id: string): LessonWorkspaceSnapshot => ({
      lessons,
      selectedLesson: { ...confirmedLesson(), id, topic: id === "millions" ? "Millions" : "Trillions" },
      availableSchemeEntries: [],
    });
    let releaseUnnamed: (() => void) | null = null;
    const unnamedAnswered = new Promise<void>((resolve) => {
      releaseUnnamed = resolve;
    });

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={{
          ...gatewayWith(snapshotSelecting("trillions")),
          getWorkspace: vi.fn(async (request) => {
            // The screen's own read carries no lesson, and here it answers last.
            if (!request.selectedLessonId) {
              await unnamedAnswered;
              return snapshotSelecting("trillions");
            }
            releaseUnnamed?.();
            return snapshotSelecting(request.selectedLessonId);
          }),
        }}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        arrivedFrom={{ lessonId: "millions" }}
      />,
    );

    expect(await screen.findByText("Millions")).toBeVisible();
    expect(screen.queryByText("Trillions")).not.toBeInTheDocument();
  });

  /// The week the class is actually in wins over the list's order, so a teacher
  /// lands on what they are about to teach.
  it("prefers this week's lesson when the class has a scheduled week", async () => {
    const load = vi.fn();
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [
        { id: "later", topic: "Fractions", subtopic: null, status: "draft", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: 9, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" },
        { id: "this-week", topic: "Linear equations", subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: 3, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" },
      ],
      selectedLesson: null,
      availableSchemeEntries: [],
    };
    render(
      <LessonsWorkspace
        academicContext={{
          ...academicContext,
          assignment: { ...academicContext.assignment, currentWeek: { ordinal: 3, title: null , standing: "thisWeek" } },
        }}
        gateway={{ ...gatewayWith(snapshot), getWorkspace: vi.fn(async (request) => {
          if (request.selectedLessonId) load(request.selectedLessonId);
          return snapshot;
        }) }}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await waitFor(() => expect(load).toHaveBeenCalledWith("this-week"));
  });

  /// The defect this exists for: a classwork run the app still records looked
  /// like nothing had happened once the screen that started it was gone.
  it("opens the classwork a teacher left being created, rather than the plan", async () => {
    const lesson = confirmedLesson();
    const snapshot: LessonWorkspaceSnapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    };
    const creating = {
      id: "task-instructional-materials",
      kind: "classwork",
      lessonId: lesson.id,
      label: "Creating lesson classwork — Linear equations",
      status: "running" as const,
      queuePosition: null,
      failureMessage: null,
      startedAt: "2026-07-31 07:00:00",
      updatedAt: "2026-07-31 07:00:00",
      finishedAt: null,
      dismissedAt: null,
    };
    const taskStore = new BackgroundTaskStore({
      list: vi.fn().mockResolvedValue([creating]),
      get: vi.fn().mockResolvedValue(creating),
      cancel: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      onChanged: vi.fn().mockResolvedValue(() => undefined),
    });
    const getClasswork = vi.fn().mockResolvedValue(classworkSnapshotFor(lesson));

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={{ ...classworkGateway, getWorkspace: getClasswork }}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        taskStore={taskStore}
        arrivedFrom={{ lessonId: lesson.id, openAt: "classwork" }}
      />,
    );

    // Lands in the classwork, with the week still beside it.
    expect(await screen.findByRole("button", { name: "Create the classwork" })).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Lessons in this class and term" }),
    ).toBeVisible();
    taskStore.close();
  });

  /// Reported from the running app: confirming replaced the screen with a page
  /// carrying the lesson's title and nothing else — not the week, not the goals,
  /// not a line of what had just been approved — and took the week list with it.
  it("shows the lesson it just confirmed rather than a page about it", async () => {
    const lesson = {
      id: "lesson-settled",
      topic: "Whole numbers",
      subtopic: "Billions",
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Count in billions."],
      steps: [{ id: "step", sequence: 1, title: "Count", teacherActivity: "Model counting.", learnerActivity: "Count aloud.", durationMinutes: 20 }],
      instructionalMaterials: [],
      assessment: ["Exit question"],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "confirmed" as const,
      latestVersionNumber: 1,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: lesson.subtopic, status: "confirmed", inputMode: "structured", planFormat: "granular", latestVersionNumber: 1, weekOrdinal: 1, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    } as unknown as LessonWorkspaceSnapshot;

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    // The lesson list stays, so the lesson is still placed among the others.
    // "New lesson" belongs to that shell and to no other screen.
    expect(await screen.findByRole("button", { name: /New lesson/ })).toBeVisible();
    // And what was approved is on the page, not just its name.
    expect(screen.getByText("Count in billions.")).toBeVisible();
  });

  /// Two controls were both called "Edit lesson" and did different things: one
  /// edits the lesson graspy wrote, the other opens the topic and plan text it
  /// was built from — and saving that turns a confirmed lesson back into a
  /// draft. A teacher reading a confirmed plan and reaching for "Edit lesson"
  /// got the second.
  it("names editing the source differently from editing the lesson", async () => {
    const lesson = {
      id: "lesson-named",
      topic: "Linear equations",
      subtopic: null,
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Solve equations accurately."],
      steps: [{ id: "step", sequence: 1, title: "Solve", teacherActivity: "Model a solution.", learnerActivity: "Solve one equation.", durationMinutes: 20 }],
      instructionalMaterials: [],
      assessment: ["Exit test"],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "confirmed" as const,
      latestVersionNumber: 1,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: null, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    } as unknown as LessonWorkspaceSnapshot;

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Edit the starting plan" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit lesson" }),
    ).not.toBeInTheDocument();
  });

  /// Three identical "Millions" drafts sat in the owner's list with no way to
  /// clear them, because nothing in graspy could remove a lesson.
  it("clears a lesson a teacher decided not to teach, once they say so twice", async () => {
    const lesson = {
      id: "lesson-abandoned",
      topic: "Whole Numbers",
      subtopic: "Millions",
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Count in millions."],
      steps: [],
      instructionalMaterials: [],
      assessment: [],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "draft" as const,
      latestVersionNumber: 0,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: lesson.subtopic, status: "draft", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 0, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    } as unknown as LessonWorkspaceSnapshot;
    const discardLesson = vi.fn().mockResolvedValue({ ...snapshot, lessons: [], selectedLesson: null });

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot, { discardLesson })}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Discard lesson" }));
    expect(discardLesson).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yes, discard it" }));

    expect(discardLesson).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: lesson.id }),
    );
  });

  /// A confirmed lesson is a document a school may hold, so the control that
  /// would throw it away is not offered at all.
  it("does not offer to discard a lesson that has been confirmed", async () => {
    const lesson = {
      id: "lesson-confirmed",
      topic: "Whole Numbers",
      subtopic: "Millions",
      rawPlan: null,
      sourcePlanText: null,
      learningGoals: ["Count in millions."],
      steps: [],
      instructionalMaterials: [],
      assessment: [],
      references: [],
      previousKnowledge: [],
      assignment: [],
      curriculumUnit: null,
      curriculumOutcomes: [],
      status: "confirmed" as const,
      latestVersionNumber: 1,
      preparation: null,
      granularRecord: null,
      answerReport: null,
    };
    const snapshot = {
      lessons: [{ id: lesson.id, topic: lesson.topic, subtopic: lesson.subtopic, status: "confirmed", inputMode: "structured", planFormat: "legacy_import", latestVersionNumber: 1, weekOrdinal: null, schemeEntryId: null, classworkComplete: false, startedAt: "2026-07-21 13:53:35" }],
      selectedLesson: lesson,
      availableSchemeEntries: [],
    } as unknown as LessonWorkspaceSnapshot;

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
      />,
    );

    expect(await screen.findByRole("button", { name: "Edit the starting plan" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Discard lesson" })).not.toBeInTheDocument();
  });

  /// Seen in the running app: the review screen said "Prepared — review before
  /// you confirm" while the task bar said the same lesson was still being
  /// prepared. It invited a teacher to approve a plan about to be replaced.
  it("does not call a lesson prepared while graspy is writing it again", async () => {
    // A draft carrying a prepared plan is what puts the review screen on screen.
    const lesson = {
      id: "lesson-rewritten",
      topic: "Equivalent fractions",
      subtopic: "Visual models",
      status: "draft" as const,
      inputMode: "pasted" as const,
      planFormat: "granular" as const,
      rawPlan: "Compare halves and quarters.",
      learningGoals: [],
      steps: [],
      instructionalMaterials: [],
      assessment: [],
      references: [],
      curriculumNodeIds: [],
      version: 1,
      granularRecord: granularRecord(),
    };
    const snapshot = {
      ...emptySnapshot,
      lessons: [lesson],
      selectedLesson: lesson,
    } as unknown as LessonWorkspaceSnapshot;
    const running = {
      id: "task-running",
      kind: "lesson_preparation",
      lessonId: lesson.id,
      label: "Preparing Equivalent fractions",
      status: "running" as const,
      queuePosition: null,
      failureMessage: null,
      startedAt: "2026-07-30 10:00:00",
      updatedAt: "2026-07-30 10:00:00",
      finishedAt: null,
      dismissedAt: null,
    };
    const taskStore = new BackgroundTaskStore({
      list: vi.fn().mockResolvedValue([running]),
      get: vi.fn().mockResolvedValue(running),
      cancel: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      onChanged: vi.fn().mockResolvedValue(() => undefined),
    });

    render(
      <LessonsWorkspace
        academicContext={academicContext}
        gateway={gatewayWith(snapshot)}
        preparationGenerator={preparationGenerator}
        classworkGateway={classworkGateway}
        noteGenerator={noteGenerator}
        evidenceGateway={evidenceGateway}
        differentiatedClassworkGateway={differentiatedClassworkGateway}
        taskStore={taskStore}
      />,
    );

    expect(
      await screen.findByText("graspy is writing this lesson again.", { exact: false }),
    ).toBeVisible();
    expect(
      screen.queryByText("Prepared — review before you confirm.", { exact: false }),
    ).not.toBeInTheDocument();
    // Approving a plan that is about to be overwritten is the thing to prevent,
    // not merely to warn about.
    expect(screen.getByRole("button", { name: "Confirm lesson" })).toBeDisabled();
    taskStore.close();
  });
});
