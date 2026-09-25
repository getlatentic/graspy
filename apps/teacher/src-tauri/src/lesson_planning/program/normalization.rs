//! Canonicalises model-drafted plans: settles fraction-ordering answers and hints
//! from the operands they are decided by, so the same value is never carried
//! separately and contradicted.

use super::{
    deterministic_fault, parse, AssessmentPlan, BoundObjectivePlan, CoreInstructionPlan,
    CorePracticePlan, CoreStepPlan, DraftedAssessmentPlan, GeneratedPractice,
    GranularLessonProgramInput, KnowledgePlan,
};
use crate::generation_program::domain::RuntimeFault;
use crate::lesson_planning::granular::AssessmentItem;
use crate::lesson_planning::mathematics::{
    canonical_fraction_answer, fraction_ordering_practice_hints,
};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn normalized_assessment_plan(output: &Value) -> Result<AssessmentPlan, RuntimeFault> {
    let plan = parse::<AssessmentPlan>(output, "generated assessment plan")?;
    Ok(normalize_assessment_plan(plan))
}

/// Turns what the model wrote into complete assessments by attaching the
/// identifiers the lesson already knows: the objective comes from the position
/// the model gave, the knowledge component from the alignment already chosen for
/// that objective, and the sources from that component's own evidence.
pub(super) fn assessments_from_drafts(
    output: &Value,
    lesson: &GranularLessonProgramInput,
    objectives: &BoundObjectivePlan,
    knowledge: &KnowledgePlan,
) -> Result<AssessmentPlan, RuntimeFault> {
    let drafted = parse::<DraftedAssessmentPlan>(output, "generated assessment plan")?;
    let alignment = knowledge
        .objective_knowledge
        .iter()
        .map(|selection| {
            (
                selection.lesson_objective_id.as_str(),
                selection.knowledge_component_id.as_str(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    // Only evidence the run was actually handed. A component may cite more
    // records than the excerpt budget allowed through, and an assessment that
    // inherits the full list is rejected for citing what nobody supplied.
    let supplied = lesson
        .source_evidence_snapshot
        .records
        .iter()
        .map(|record| record.record_id.as_str())
        .collect::<BTreeSet<_>>();
    let evidence = lesson
        .curriculum_snapshot
        .knowledge_components
        .iter()
        .map(|component| {
            (
                component.id.as_str(),
                component
                    .supporting_record_ids
                    .iter()
                    .filter(|record_id| supplied.contains(record_id.as_str()))
                    .cloned()
                    .collect::<Vec<_>>(),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let assessments = drafted
        .assessments
        .into_iter()
        .enumerate()
        .map(|(index, draft)| {
            let objective = objectives
                .lesson_objectives
                .iter()
                .find(|objective| objective.sequence == draft.lesson_objective_sequence)
                .ok_or_else(|| {
                    deterministic_fault(vec![format!(
                        "Assessment {} refers to learning goal {}, which this lesson does not have.",
                        index + 1,
                        draft.lesson_objective_sequence
                    )])
                })?;
            let knowledge_component_id = alignment
                .get(objective.id.as_str())
                .copied()
                .ok_or_else(|| {
                    deterministic_fault(vec![format!(
                        "Learning goal {} has no knowledge aligned to it.",
                        draft.lesson_objective_sequence
                    )])
                })?;
            Ok(AssessmentItem {
                id: format!("assessment-{}", index + 1),
                lesson_objective_id: objective.id.clone(),
                knowledge_component_id: knowledge_component_id.to_owned(),
                question: draft.question,
                expected_answer: draft.expected_answer,
                bloom_level: draft.bloom_level,
                rubric: draft.rubric,
                supporting_record_ids: {
                    let cited = evidence.get(knowledge_component_id).cloned().unwrap_or_default();
                    if cited.is_empty() {
                        return Err(deterministic_fault(vec![format!(
                            "Learning goal {} has knowledge with no supplied source material behind it.",
                            draft.lesson_objective_sequence
                        )]));
                    }
                    cited
                },
            })
        })
        .collect::<Result<Vec<_>, RuntimeFault>>()?;

    Ok(normalize_assessment_plan(AssessmentPlan { assessments }))
}

pub(super) fn normalize_assessment_plan(mut plan: AssessmentPlan) -> AssessmentPlan {
    for assessment in &mut plan.assessments {
        if let Some(answer) = canonical_fraction_answer(&assessment.question) {
            assessment.expected_answer = answer;
        }
    }
    plan
}

pub(super) fn normalized_core_step_plan(output: &Value) -> Result<CoreStepPlan, RuntimeFault> {
    let plan = parse::<CoreStepPlan>(output, "generated core-step plan")?;
    Ok(normalize_core_step_plan(plan))
}

pub(super) fn normalized_core_instruction_plan(
    output: &Value,
) -> Result<CoreInstructionPlan, RuntimeFault> {
    let mut plan = parse::<CoreInstructionPlan>(output, "generated core-instruction plan")?;
    for step in &mut plan.core_steps {
        for example in &mut step.worked_examples {
            if let Some(answer) = canonical_fraction_answer(&example.problem) {
                example.final_answer = answer;
            }
        }
    }
    Ok(plan)
}

pub(super) fn normalized_core_practice_plan(
    output: &Value,
) -> Result<CorePracticePlan, RuntimeFault> {
    let mut plan = parse::<CorePracticePlan>(output, "generated core-practice plan")?;
    for step in &mut plan.core_steps {
        for practice in &mut step.practice_questions {
            settle_fraction_practice(practice);
        }
    }
    Ok(plan)
}

pub(super) fn normalize_core_step_plan(mut plan: CoreStepPlan) -> CoreStepPlan {
    for step in &mut plan.core_steps {
        for example in &mut step.worked_examples {
            if let Some(answer) = canonical_fraction_answer(&example.problem) {
                example.final_answer = answer;
            }
        }
        for practice in &mut step.practice_questions {
            settle_fraction_practice(practice);
        }
    }
    plan
}

/// Replaces the answer and the hints of a fraction-ordering task with the ones
/// its own operands give.
///
/// Both are decided entirely by the question, and a small model asked to carry
/// them alongside writing the question names denominators the question does not
/// use. Questions on other topics keep what the model wrote, because nothing here
/// can work them out.
fn settle_fraction_practice(practice: &mut GeneratedPractice) {
    if let Some(answer) = canonical_fraction_answer(&practice.question) {
        practice.expected_answer = answer;
    }
    if let Some(hints) = fraction_ordering_practice_hints(&practice.question) {
        practice.hints = hints;
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    use crate::lesson_planning::program::test_support::*;

    #[test]
    fn replaces_model_arithmetic_with_canonical_fraction_answers() {
        let (_, _, _, _, mut assessments, mut core) = input_and_stage_outputs();
        assessments.assessments[1].question =
            "Order 1/3, 1/4, and 1/6 from least to greatest.".to_owned();
        assessments.assessments[1].expected_answer = "1/6, 1/3, 1/4".to_owned();
        core.core_steps[1].worked_examples[0].problem =
            "Order 1/3, 1/4, and 1/6 from least to greatest.".to_owned();
        core.core_steps[1].worked_examples[0].final_answer = "1/6, 1/3, 1/4".to_owned();

        let assessments = normalize_assessment_plan(assessments);
        let core = normalize_core_step_plan(core);

        assert_eq!(
            assessments.assessments[1].expected_answer,
            "1/6 < 1/4 < 1/3"
        );
        assert_eq!(
            core.core_steps[1].worked_examples[0].final_answer,
            "1/6 < 1/4 < 1/3"
        );
    }

    #[test]
    fn settles_a_two_fraction_comparison_assessment_from_its_own_operands() {
        let (_, _, _, _, mut assessments, _) = input_and_stage_outputs();
        assessments.assessments[1].question =
            "Compare the following two fractions using a common representation (e.g., a number \
             line or by finding a common denominator). Show your steps:\n\n1/2 ≈ ≈ 2/4"
                .to_owned();
        assessments.assessments[1].expected_answer = "1/2 > 1/4".to_owned();

        let assessments = normalize_assessment_plan(assessments);

        assert_eq!(assessments.assessments[1].expected_answer, "1/2 = 2/4");
    }
}
