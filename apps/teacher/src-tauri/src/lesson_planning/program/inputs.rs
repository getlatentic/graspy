//! Builds each node's input payload from the program input and its upstream
//! outputs.

use super::binding::{bind_knowledge_plan, bind_objective_plan, build_knowledge_selection_catalog};
use super::normalization::{
    normalized_assessment_plan, normalized_core_instruction_plan, normalized_core_step_plan,
};
use super::{
    deterministic_fault, parse, required_output, BoundObjectivePlan, GranularLessonProgramInput,
};
use crate::generation_program::domain::RuntimeFault;
use crate::lesson_planning::mathematics::reserved_practice_value_sets;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(super) fn copy_input(
    input: &Value,
    _outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    parse::<GranularLessonProgramInput>(input, "lesson-planning input")?
        .validate()
        .map_err(|error| deterministic_fault(vec![error]))?;
    Ok(input.clone())
}

pub(super) fn build_knowledge_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let objective_plan = bind_objective_plan(input, outputs)?;
    let selection_catalog = build_knowledge_selection_catalog(&lesson, &objective_plan)?;
    Ok(json!({
        "lesson": input,
        "objectivePlan": objective_plan,
        "selectionCatalog": selection_catalog,
    }))
}

pub(super) fn build_assessment_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let objective_plan = bind_objective_plan(input, outputs)?;
    let knowledge_plan = bind_knowledge_plan(&lesson, &objective_plan, outputs)?;
    Ok(json!({
        "lesson": input,
        "objectivePlan": objective_plan,
        "knowledgePlan": knowledge_plan,
    }))
}

pub(super) fn build_assessment_completion_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let objective_plan = bind_objective_plan(input, outputs)?;
    let knowledge_plan = bind_knowledge_plan(&lesson, &objective_plan, outputs)?;
    Ok(json!({
        "lesson": input,
        "objectivePlan": objective_plan,
        "knowledgePlan": knowledge_plan,
        "draftAssessmentPlan": required_output(outputs, "draftAssessmentPlan")?,
    }))
}

pub(super) fn build_core_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let objective_plan = bind_objective_plan(input, outputs)?;
    let knowledge_plan = bind_knowledge_plan(&lesson, &objective_plan, outputs)?;
    let figure_catalog = lesson
        .source_evidence_snapshot
        .figures
        .iter()
        .enumerate()
        .map(|(index, figure)| {
            json!({
                "sequence": index + 1,
                "caption": figure.caption,
                "altText": figure.alt_text,
            })
        })
        .collect::<Vec<_>>();
    let core_step_assignments = core_step_assignments(&objective_plan);
    Ok(json!({
        "requiredCoreStepCount": core_step_assignments.len(),
        "coreStepAssignments": core_step_assignments,
        "lesson": input,
        "objectivePlan": objective_plan,
        "knowledgePlan": knowledge_plan,
        "evidencePlan": required_output(outputs, "evidencePlan")?,
        "figureCatalog": figure_catalog,
    }))
}

pub(super) fn build_core_practice_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let objective_plan = bind_objective_plan(input, outputs)?;
    let knowledge_plan = bind_knowledge_plan(&lesson, &objective_plan, outputs)?;
    let instruction_plan =
        normalized_core_instruction_plan(required_output(outputs, "coreInstructionPlan")?)?;
    // Each practice task is handed its own set of values, taken from the source
    // material and never one the lesson has already modelled. Asking a small
    // model to invent a distinct set per task does not work: it reuses the
    // worked example's numbers and merely reverses them.
    let modelled_problems = instruction_plan
        .core_steps
        .iter()
        .flat_map(|step| {
            step.worked_examples
                .iter()
                .map(|example| example.problem.clone())
        })
        .collect::<Vec<_>>();
    let source_texts = lesson
        .source_evidence_snapshot
        .records
        .iter()
        .map(|record| record.excerpt.clone())
        .collect::<Vec<_>>();
    let objective_statements = objective_plan
        .lesson_objectives
        .iter()
        .map(|objective| objective.statement.clone())
        .collect::<Vec<_>>();
    let mut reserved_values =
        reserved_practice_value_sets(&source_texts, &modelled_problems, &objective_statements)
            .into_iter();

    let practice_assignments = objective_plan
        .lesson_objectives
        .iter()
        .zip(&instruction_plan.core_steps)
        .map(|(objective, step)| {
            let mut assignment = json!({
                "lessonObjectiveSequence": objective.sequence,
                "statement": objective.statement,
                "immutableWorkedExampleProblems": step
                    .worked_examples
                    .iter()
                    .map(|example| example.problem.as_str())
                    .collect::<Vec<_>>(),
            });
            if let Some(values) = reserved_values.next() {
                assignment["valuesReservedForThisTask"] = json!(values);
            }
            assignment
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "requiredPracticeStepCount": practice_assignments.len(),
        "practiceAssignments": practice_assignments,
        "lesson": input,
        "objectivePlan": objective_plan,
        "knowledgePlan": knowledge_plan,
        "coreInstructionPlan": instruction_plan,
    }))
}

pub(super) fn build_core_assembly_input(
    _input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    Ok(json!({
        "coreInstructionPlan": required_output(outputs, "coreInstructionPlan")?,
        "corePracticePlan": required_output(outputs, "corePracticePlan")?,
    }))
}

pub(super) fn build_practice_completion_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let objective_plan = bind_objective_plan(input, outputs)?;
    let instruction_plan =
        normalized_core_instruction_plan(required_output(outputs, "coreInstructionPlan")?)?;
    Ok(json!({
        "lesson": lesson,
        "objectivePlan": objective_plan,
        "assessmentPlan": required_output(outputs, "assessmentPlan")?,
        "coreInstructionPlan": instruction_plan,
        "draftCorePracticePlan": required_output(outputs, "draftCorePracticePlan")?,
    }))
}

pub(super) fn core_step_assignments(objective_plan: &BoundObjectivePlan) -> Vec<Value> {
    objective_plan
        .lesson_objectives
        .iter()
        .map(|objective| {
            json!({
                "lessonObjectiveSequence": objective.sequence,
                "statement": objective.statement,
            })
        })
        .collect()
}

pub(super) fn build_assembly_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let objective_plan = bind_objective_plan(input, outputs)?;
    let knowledge_plan = bind_knowledge_plan(&lesson, &objective_plan, outputs)?;
    let assessment_plan = normalized_assessment_plan(required_output(outputs, "assessmentPlan")?)?;
    let core_step_plan = normalized_core_step_plan(required_output(outputs, "coreStepPlan")?)?;
    Ok(json!({
        "lesson": input,
        "objectivePlan": objective_plan,
        "knowledgePlan": knowledge_plan,
        "assessmentPlan": assessment_plan,
        "evidencePlan": required_output(outputs, "evidencePlan")?,
        "coreStepPlan": core_step_plan,
    }))
}

pub(super) fn build_validation_input(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<Value, RuntimeFault> {
    Ok(json!({
        "lesson": input,
        "assembledLesson": required_output(outputs, "assembledLesson")?,
    }))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    use crate::lesson_planning::program::test_support::*;

    #[test]
    fn core_input_states_the_exact_ordered_step_assignments() {
        let (_, _, objectives, _, _, _) = input_and_stage_outputs();
        let assignments = core_step_assignments(&objectives);

        assert_eq!(
            assignments,
            vec![
                json!({
                    "lessonObjectiveSequence": 1,
                    "statement": "Compare two fractions on a number line."
                }),
                json!({
                    "lessonObjectiveSequence": 2,
                    "statement": "Order three fractions by finding a common denominator."
                })
            ]
        );
    }
}
