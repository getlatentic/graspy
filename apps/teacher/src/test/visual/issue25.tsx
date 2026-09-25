import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import type { GranularLessonRecord } from "../../features/lesson-planning/domain/granularLesson";
import type { LessonDraft } from "../../features/lesson-planning/domain/lessonPlanning";
import { GranularLessonReview } from "../../features/lesson-planning/ui/GranularLessonReview";

const objective = {
  id: "lesson-objective-1",
  statement: "Compare equivalent fractions using visual models and explain why they represent the same quantity.",
  sequence: 1,
  curriculumObjectiveId: "curriculum-objective-1",
  atomicObjectiveId: "atomic-objective-1",
  knowledgeComponentId: "knowledge-1",
};

const atomicObjective = {
  id: "atomic-objective-1",
  curriculumObjectiveId: "curriculum-objective-1",
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

const record = {
  plan: {
    schemaVersion: 1,
    topic: "Equivalent fractions",
    subtopic: "Visual models",
    curriculumObjectives: [
      { id: "curriculum-objective-1", statement: "Recognise and compare equivalent fractions.", sequence: 1 },
    ],
    atomicObjectives: [atomicObjective],
    lessonObjectives: [objective],
    knowledgeComponents: [knowledgeComponent],
    misconceptions: [
      {
        id: "misconception-1",
        statement: "A larger denominator always means a larger fraction.",
        correction: "Compare the quantity shown by the model, not the denominator alone.",
        knowledgeComponentIds: ["knowledge-1"],
        supportingRecordIds: ["source-1"],
      },
    ],
    priorKnowledge: [
      {
        id: "prior-1",
        statement: "Learners can divide one whole into equal parts and name halves and quarters.",
        knowledgeComponentIds: ["knowledge-1"],
        supportingRecordIds: ["source-1"],
      },
    ],
    instructionalMaterials: ["Fraction strips", "Board and markers", "Exit slips"],
    references: [
      { recordId: "source-1", title: "Equivalent fractions", attribution: "Siyavula Mathematics · CC BY 3.0" },
    ],
    steps: [
      {
        id: "step-introduction",
        sequence: 1,
        role: "introduction",
        title: "Recall equal parts",
        summary: "Reconnect halves and quarters to familiar visual models.",
        durationMinutes: 10,
        lessonObjectiveId: null,
        knowledgeType: null,
        teacherActivities: ["Display a whole divided into equal parts.", "Ask learners to name each part."],
        learnerActivities: ["Name halves and quarters.", "Explain what makes the parts equal."],
        blocks: [],
      },
      {
        id: "step-core",
        sequence: 2,
        role: "core",
        title: "Compare equivalent models",
        summary: "Align one-half and two-quarter strips to compare their lengths.",
        durationMinutes: 30,
        lessonObjectiveId: objective.id,
        knowledgeType: "concept",
        teacherActivities: ["Align the fraction strips.", "Model a precise comparison statement."],
        learnerActivities: ["Compare the strips.", "Explain why both fractions name the same quantity."],
        blocks: [
          { type: "explanation", id: "explanation-1", content: "Equivalent fractions use different numbers to name the same quantity." },
          { type: "practice", id: "practice-1", lessonObjectiveId: objective.id, question: "Use fraction strips to decide whether 3/6 equals 1/2.", expectedAnswer: "Yes. Both strips cover the same length.", hints: ["Align the strips at the same starting point."] },
        ],
      },
      {
        id: "step-evaluation",
        sequence: 3,
        role: "evaluation",
        title: "Check understanding",
        summary: "Use a new fraction pair to check the learning goal.",
        durationMinutes: 10,
        lessonObjectiveId: null,
        knowledgeType: null,
        teacherActivities: ["Share the exit question."],
        learnerActivities: ["Complete and explain the exit question."],
        blocks: [],
      },
    ],
    assessments: [
      {
        id: "assessment-1",
        lessonObjectiveId: objective.id,
        knowledgeComponentId: "knowledge-1",
        question: "Draw a model that shows why 2/4 equals 1/2.",
        expectedAnswer: "Two of four equal parts cover the same area as one of two equal parts.",
        bloomLevel: "understand",
        rubric: ["Draws equal wholes", "Shades equivalent areas", "Explains the equal quantity"],
        supportingRecordIds: ["source-1"],
      },
    ],
  },
  curriculumSnapshot: {
    packageTitle: "Nigerian Basic Education Mathematics",
    atomicObjectives: [atomicObjective],
    knowledgeComponents: [knowledgeComponent],
  },
  sourceEvidenceSnapshot: { figures: [] },
} as unknown as GranularLessonRecord;

const lesson = {
  id: "lesson-1",
  status: "draft",
  sourcePlanText: null,
  rawPlan: "Introduce one half and two quarters with fraction strips. Learners compare both models and explain what they notice.",
} as LessonDraft;

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <GranularLessonReview
    lesson={lesson}
    weekOrdinal={1}
    record={record}
    originalPlan={lesson.rawPlan}
    pendingAction={null}
    beingPreparedAgain={false}
    error={null}
    onBack={() => undefined}
    onSave={async () => true}
    onConfirm={async () => true}
    onRedraft={() => undefined}
  />,
);
