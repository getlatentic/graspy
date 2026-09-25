import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { AssessmentList } from "../../features/lesson-planning/ui/LessonReviewSections";
import type { EditableStep } from "../../features/lesson-planning/ui/lessonStepDraft";
import { StructuredLessonFields } from "../../features/lesson-planning/ui/StructuredLessonFields";
import type { LessonCheck } from "../../features/lesson-planning/domain/lessonChecks";

/**
 * The lesson controls a teacher taps that carry no border or fill of their own —
 * the folds whose label is the whole control. Their target has to be stated, so
 * this page renders them where a real height can be measured.
 */
const checks: readonly LessonCheck[] = [
  {
    question: "Write four billion, two hundred and eight million in figures.",
    objective: "Write whole numbers up to one billion in figures and words.",
    answer: "4 208 000 000",
    rubric: ["Nine digits", "Grouped in threes"],
  },
  {
    question: "How many zeros does one billion have?",
    objective: "Read whole numbers up to one billion.",
    answer: "Nine",
    rubric: ["Counts from the units group"],
  },
];

const blankStep: EditableStep = {
  title: "",
  teacherActivity: "",
  learnerActivity: "",
  durationMinutes: "",
};

export function EditorFolds() {
  const [steps, setSteps] = useState<EditableStep[]>([blankStep]);
  const [learningGoals, setLearningGoals] = useState("Read whole numbers up to one billion.");
  const [instructionalMaterials, setInstructionalMaterials] = useState("");
  const [previousKnowledge, setPreviousKnowledge] = useState("");
  const [assessment, setAssessment] = useState("");
  const [assignment, setAssignment] = useState("");
  const [references, setReferences] = useState("");
  return (
    <StructuredLessonFields
      learningGoals={learningGoals}
      instructionalMaterials={instructionalMaterials}
      previousKnowledge={previousKnowledge}
      assessment={assessment}
      assignment={assignment}
      references={references}
      steps={steps}
      onLearningGoalsChange={setLearningGoals}
      onInstructionalMaterialsChange={setInstructionalMaterials}
      onPreviousKnowledgeChange={setPreviousKnowledge}
      onAssessmentChange={setAssessment}
      onAssignmentChange={setAssignment}
      onReferencesChange={setReferences}
      onStepsChange={setSteps}
    />
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div className="mx-auto grid max-w-[61rem] gap-3xl p-xl">
    <AssessmentList checks={checks} />
    <EditorFolds />
  </div>,
);
