import { TextArea } from "@carbon/react";

import type { EditableStep } from "./lessonStepDraft";
import { LessonStepsEditor } from "./LessonStepsEditor";
import { WritableSection } from "./WritableSection";

/**
 * The written parts of a lesson, in the order a lesson plan carries them.
 *
 * Every section here is a heading on the plan a school reads, so the words are
 * the words on that paper: instructional materials are what the teacher brings
 * to class, and previous knowledge is what the class already has to build on.
 */
interface StructuredLessonFieldsProps {
  readonly learningGoals: string;
  readonly instructionalMaterials: string;
  readonly previousKnowledge: string;
  readonly assessment: string;
  readonly assignment: string;
  readonly references: string;
  readonly steps: EditableStep[];
  readonly onLearningGoalsChange: (value: string) => void;
  readonly onInstructionalMaterialsChange: (value: string) => void;
  readonly onPreviousKnowledgeChange: (value: string) => void;
  readonly onAssessmentChange: (value: string) => void;
  readonly onAssignmentChange: (value: string) => void;
  readonly onReferencesChange: (value: string) => void;
  readonly onStepsChange: (steps: EditableStep[]) => void;
}

export function StructuredLessonFields({
  learningGoals,
  instructionalMaterials,
  previousKnowledge,
  assessment,
  assignment,
  references,
  steps,
  onLearningGoalsChange,
  onInstructionalMaterialsChange,
  onPreviousKnowledgeChange,
  onAssessmentChange,
  onAssignmentChange,
  onReferencesChange,
  onStepsChange,
}: StructuredLessonFieldsProps) {
  return (
    <>
      <section className="grid min-w-0 gap-lg border-b border-rule pb-xl">
        <div>
          <h2 className="m-0 text-md text-ink">Learning goals</h2>
          <p className="m-0 mt-xs max-w-[65ch] leading-body text-ink-secondary">One goal per line. These shape everything graspy prepares.</p>
        </div>
        {/* The heading above is the label; Carbon's own would be the second.
            Six rows because a weekly plan routinely supplies four or five goals
            and three rows cut the last one in half. */}
        <TextArea
          id="lesson-learning-goals"
          labelText="Learning goals"
          hideLabel
          required
          rows={6}
          value={learningGoals}
          onChange={(event) => onLearningGoalsChange(event.currentTarget.value)}
        />
      </section>

      <LessonStepsEditor steps={steps} onStepsChange={onStepsChange} />

      <WritableSection
        title="The rest of the lesson plan"
        className="border-t border-rule"
        open={
          instructionalMaterials.trim() !== "" ||
          previousKnowledge.trim() !== "" ||
          assessment.trim() !== "" ||
          assignment.trim() !== ""
        }
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-lg pt-lg sm:grid-cols-2">
          <TextArea
            id="classwork"
            labelText="Instructional materials"
            helperText="What you will bring to class. One per line."
            rows={2}
            value={instructionalMaterials}
            onChange={(event) => onInstructionalMaterialsChange(event.currentTarget.value)}
          />
          <TextArea
            id="lesson-previous-knowledge"
            labelText="Previous knowledge"
            helperText="What the class already knows that this lesson builds on."
            rows={2}
            value={previousKnowledge}
            onChange={(event) => onPreviousKnowledgeChange(event.currentTarget.value)}
          />
          <TextArea
            id="lesson-assessment"
            labelText="Assessment"
            helperText="How you will check learning at the end."
            rows={2}
            value={assessment}
            onChange={(event) => onAssessmentChange(event.currentTarget.value)}
          />
          <TextArea
            id="lesson-assignment"
            labelText="Assignment"
            helperText="The work you will set to take home."
            rows={2}
            value={assignment}
            onChange={(event) => onAssignmentChange(event.currentTarget.value)}
          />
          <TextArea
            id="lesson-references"
            labelText="Sources (optional)"
            rows={2}
            value={references}
            onChange={(event) => onReferencesChange(event.currentTarget.value)}
          />
        </div>
      </WritableSection>
    </>
  );
}
