//! Output validators for the model-authored stages: every violation a stage finds
//! is reported together so one repair can address them all.

use super::binding::{grounded_item_violations, resolve_knowledge_plan};
use super::normalization::{
    normalize_assessment_plan, normalized_core_instruction_plan, normalized_core_practice_plan,
};
use super::{
    sequence_index, AssessmentPlan, BoundObjectivePlan, CoreInstructionPlan, CorePracticePlan,
    DraftedAssessmentPlan, GeneratedKnowledgePlan, GranularLessonProgramInput, KnowledgePlan,
    ObjectivePlan,
};
use crate::generation_program::domain::{ValidationCheck, ValidationReport};
use crate::lesson_planning::granular::KnowledgeType;
use crate::lesson_planning::lesson_prose::{
    reject_explanation_echoing_example, reject_generation_narration,
    reject_practice_repeating_example,
};
use crate::lesson_planning::mathematics::{
    canonical_fraction_answer, fraction_ordering_value_set_signature,
    validate_answer_fraction_provenance, validate_fraction_ordering_hints,
    validate_fraction_ordering_practice,
    validate_fraction_ordering_worked_example, validate_lesson_question_text,
};
use crate::lesson_planning::answer_checking::check_answer;
use crate::lesson_planning::place_value::validate_large_number_scale;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
use super::normalization::normalize_core_step_plan;
#[cfg(test)]
use super::CoreStepPlan;

pub(super) fn decode_objective_plan(output: &Value) -> ValidationReport {
    decode_report::<ObjectivePlan>(output, "objective-plan-structure")
}

pub(super) fn decode_knowledge_plan(output: &Value) -> ValidationReport {
    decode_report::<GeneratedKnowledgePlan>(output, "knowledge-plan-structure")
}

pub(super) fn decode_assessment_plan(output: &Value) -> ValidationReport {
    decode_report::<DraftedAssessmentPlan>(output, "assessment-plan-structure")
}

pub(super) fn decode_core_instruction_plan(output: &Value) -> ValidationReport {
    decode_report::<CoreInstructionPlan>(output, "core-instruction-plan-structure")
}

pub(super) fn decode_core_practice_plan(output: &Value) -> ValidationReport {
    decode_report::<CorePracticePlan>(output, "core-practice-plan-structure")
}

pub(super) fn validate_objective_plan(input: &Value, output: &Value) -> ValidationReport {
    const NAME: &str = "objective-plan-alignment";
    let parsed = (|| {
        Ok::<_, String>((
            parse_validation::<GranularLessonProgramInput>(input)?,
            parse_validation::<ObjectivePlan>(output)?,
        ))
    })();
    let (input, output) = match parsed {
        Ok(values) => values,
        Err(error) => return Violations::single(error).into_report(NAME),
    };
    // The per-objective checks read positions against the curriculum, so a count
    // mismatch makes them meaningless; it is reported on its own.
    if output.lesson_objectives.len() != input.curriculum_snapshot.atomic_objectives.len() {
        return Violations::single(
            "Create exactly one lesson objective for every focused curriculum objective.",
        )
        .into_report(NAME);
    }
    let mut violations = Violations::default();
    for (index, objective) in output.lesson_objectives.iter().enumerate() {
        let Ok(expected_sequence) = u16::try_from(index + 1) else {
            violations.add("There are too many lesson objectives.");
            continue;
        };
        if objective.sequence != expected_sequence || objective.statement.trim().is_empty() {
            violations.add("Lesson objectives need clear statements in the supplied order.");
        }
    }
    violations.into_report(NAME)
}

pub(super) fn validate_knowledge_plan(input: &Value, output: &Value) -> ValidationReport {
    const NAME: &str = "knowledge-plan-alignment";
    let parsed = (|| {
        let lesson = parse_validation::<GranularLessonProgramInput>(&input["lesson"])?;
        let objectives = parse_validation::<BoundObjectivePlan>(&input["objectivePlan"])?;
        let generated = parse_validation::<GeneratedKnowledgePlan>(output)?;
        let resolved = resolve_knowledge_plan(&lesson, &objectives, &generated)?;
        Ok::<_, String>((lesson, objectives, resolved))
    })();
    let (lesson, objectives, output) = match parsed {
        Ok(values) => values,
        Err(error) => return Violations::single(error).into_report(NAME),
    };
    let components = lesson
        .curriculum_snapshot
        .knowledge_components
        .iter()
        .map(|component| (component.id.as_str(), component))
        .collect::<BTreeMap<_, _>>();
    let objective_by_id = objectives
        .lesson_objectives
        .iter()
        .map(|objective| (objective.id.as_str(), objective))
        .collect::<BTreeMap<_, _>>();
    let mut violations = Violations::default();
    if output.instructional_materials.is_empty() {
        violations.add("Add at least one practical teaching material.");
    }
    for material in &output.instructional_materials {
        violations.check(reject_source_artifact_material(material));
    }
    let mut aligned = BTreeSet::new();
    for selection in &output.objective_knowledge {
        let Some(objective) = objective_by_id.get(selection.lesson_objective_id.as_str()) else {
            violations.add("A knowledge selection refers to an unknown lesson objective.");
            continue;
        };
        let Some(component) = components.get(selection.knowledge_component_id.as_str()) else {
            violations.add("A knowledge selection refers to unavailable knowledge.");
            continue;
        };
        if component.is_prior_knowledge
            || !component
                .atomic_objective_ids
                .contains(&objective.atomic_objective_id)
            || !aligned.insert(selection.lesson_objective_id.as_str())
        {
            violations.add("Each lesson objective needs one aligned new knowledge component.");
        }
    }
    if aligned.len() != objective_by_id.len() {
        violations.add("Every lesson objective needs a knowledge selection.");
    }
    violations.extend(grounded_item_violations(
        &output.misconceptions,
        &output.prior_knowledge,
        &components,
        &lesson.source_evidence_snapshot,
    ));
    violations.into_report(NAME)
}

/// Learning-goal statements and knowledge-component descriptions are the lesson's
/// meta-text: what a learner should end up able to do, never the answer to any one
/// question. Collected so an expected answer that restates one can be rejected.
fn assessment_meta_texts(
    lesson: &GranularLessonProgramInput,
    objectives: &BoundObjectivePlan,
) -> BTreeSet<String> {
    lesson
        .curriculum_snapshot
        .knowledge_components
        .iter()
        .map(|component| normalize_meta_text(&component.description))
        .chain(
            objectives
                .lesson_objectives
                .iter()
                .map(|objective| normalize_meta_text(&objective.statement)),
        )
        .collect()
}

fn normalize_meta_text(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches('.')
        .trim()
        .to_lowercase()
}

/// Rejects an answer that merely restates a learning goal or knowledge component.
/// When the model echoes the curriculum instead of answering, the run must repair.
fn reject_meta_text_answer(
    question: &str,
    expected_answer: &str,
    meta_texts: &BTreeSet<String>,
) -> Result<(), String> {
    if meta_texts.contains(&normalize_meta_text(expected_answer)) {
        return Err(format!(
            "An assessment's expected answer restates a learning goal instead of answering its question. Give the actual answer to \"{}\".",
            question.trim()
        ));
    }
    Ok(())
}

/// What the model itself is answerable for: a real question, a real answer,
/// marking points, and a learning goal that exists. Everything else about an
/// assessment is attached afterwards from what the lesson already knows.
/// What one assessment owes on its own: a goal that exists, real content, an
/// answer that answers rather than restates, and arithmetic that holds.
///
/// Separated from the coverage check below because a stage that writes one
/// assessment per call can only be held to this half. Wiring the whole
/// validator per item asks one record's answer to cover every learning goal,
/// which it cannot, so every item fails.
pub(super) fn validate_drafted_assessment_items(input: &Value, output: &Value) -> ValidationReport {
    const NAME: &str = "drafted-assessment-content";
    let parsed = (|| {
        Ok::<_, String>((
            parse_validation::<GranularLessonProgramInput>(&input["lesson"])?,
            parse_validation::<BoundObjectivePlan>(&input["objectivePlan"])?,
            parse_validation::<DraftedAssessmentPlan>(output)?,
        ))
    })();
    let (lesson, objectives, drafted) = match parsed {
        Ok(values) => values,
        Err(error) => return Violations::single(error).into_report(NAME),
    };
    let meta_texts = assessment_meta_texts(&lesson, &objectives);
    let mut violations = Violations::default();
    let mut covered = BTreeSet::new();
    for draft in &drafted.assessments {
        if !objectives
            .lesson_objectives
            .iter()
            .any(|objective| objective.sequence == draft.lesson_objective_sequence)
        {
            violations.add(format!(
                "An assessment refers to learning goal {}, which this lesson does not have.",
                draft.lesson_objective_sequence
            ));
            continue;
        }
        covered.insert(draft.lesson_objective_sequence);
        if draft.question.trim().is_empty()
            || draft.expected_answer.trim().is_empty()
            || draft.rubric.is_empty()
        {
            violations
                .add("Every assessment needs a question, its expected answer, and marking points.");
            continue;
        }
        violations.check(reject_meta_text_answer(
            &draft.question,
            &draft.expected_answer,
            &meta_texts,
        ));
        violations.check(validate_large_number_scale(
            &draft.question,
            &draft.expected_answer,
        ));
        violations.check(
            validate_lesson_question_text(&draft.question).map_err(|detail| {
                format!("{detail} Rewrite the question text so a learner can act on it.")
            }),
        );
        // Where the question determines its own answer, normalize_assessment_plan
        // replaces whatever the model wrote, so checking the model's version fails
        // the run over a field that does not survive it. The assembled plan is
        // still checked, and by then the answer is right by construction.
        if canonical_fraction_answer(&draft.question).is_none() {
            violations.check(
                check_answer(&draft.question, &draft.expected_answer).only_when_wrong(),
            );
        }
    }
    let _ = covered;
    violations.into_report(NAME)
}

/// Everything one assessment owes, and the one thing only the whole set can
/// show: that no learning goal was left without a question.
pub(super) fn validate_drafted_assessments(input: &Value, output: &Value) -> ValidationReport {
    const NAME: &str = "drafted-assessment-content";
    let per_item = validate_drafted_assessment_items(input, output);
    if !per_item.passed {
        return per_item;
    }
    let parsed = (|| {
        Ok::<_, String>((
            parse_validation::<BoundObjectivePlan>(&input["objectivePlan"])?,
            parse_validation::<DraftedAssessmentPlan>(output)?,
        ))
    })();
    let (objectives, drafted) = match parsed {
        Ok(values) => values,
        Err(error) => return Violations::single(error).into_report(NAME),
    };
    let covered: BTreeSet<u16> = drafted
        .assessments
        .iter()
        .map(|draft| draft.lesson_objective_sequence)
        .collect();
    let mut violations = Violations::default();
    if objectives
        .lesson_objectives
        .iter()
        .any(|objective| !covered.contains(&objective.sequence))
    {
        violations.add("Every learning goal needs at least one assessment.");
    }
    violations.into_report(NAME)
}

pub(super) fn validate_assessment_plan(input: &Value, output: &Value) -> ValidationReport {
    const NAME: &str = "assessment-plan-alignment";
    let parsed = (|| {
        Ok::<_, String>((
            parse_validation::<GranularLessonProgramInput>(&input["lesson"])?,
            parse_validation::<BoundObjectivePlan>(&input["objectivePlan"])?,
            parse_validation::<KnowledgePlan>(&input["knowledgePlan"])?,
            normalize_assessment_plan(parse_validation::<AssessmentPlan>(output)?),
        ))
    })();
    let (lesson, objectives, knowledge, output) = match parsed {
        Ok(values) => values,
        Err(error) => return Violations::single(error).into_report(NAME),
    };
    let alignment = knowledge
        .objective_knowledge
        .iter()
        .map(|value| {
            (
                value.lesson_objective_id.as_str(),
                value.knowledge_component_id.as_str(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let objective_ids = objectives
        .lesson_objectives
        .iter()
        .map(|value| value.id.as_str())
        .collect::<BTreeSet<_>>();
    let record_ids = lesson
        .source_evidence_snapshot
        .records
        .iter()
        .map(|record| record.record_id.as_str())
        .collect::<BTreeSet<_>>();
    let meta_texts = assessment_meta_texts(&lesson, &objectives);
    let mut violations = Violations::default();
    let mut covered = BTreeSet::new();
    for assessment in &output.assessments {
        if !objective_ids.contains(assessment.lesson_objective_id.as_str())
            || alignment
                .get(assessment.lesson_objective_id.as_str())
                .copied()
                != Some(assessment.knowledge_component_id.as_str())
            || assessment.question.trim().is_empty()
            || assessment.expected_answer.trim().is_empty()
            || assessment.rubric.is_empty()
            || assessment.supporting_record_ids.is_empty()
            || assessment
                .supporting_record_ids
                .iter()
                .any(|id| !record_ids.contains(id.as_str()))
        {
            violations.add("Every assessment must be answerable and aligned to supplied objectives, knowledge, and evidence.");
            continue;
        }
        covered.insert(assessment.lesson_objective_id.as_str());
        violations.check(reject_meta_text_answer(
            &assessment.question,
            &assessment.expected_answer,
            &meta_texts,
        ));
        violations.check(validate_large_number_scale(
            &assessment.question,
            &assessment.expected_answer,
        ));
        violations.check(
            validate_lesson_question_text(&assessment.question).map_err(|detail| {
                format!("{detail} Rewrite the question text so a learner can act on it.")
            }),
        );
        // The reason comes from whichever checker read the question, because a
        // repair told "recalculate the fractions" cannot fix a counting run.
        violations.check(
            check_answer(&assessment.question, &assessment.expected_answer)
                .only_when_wrong()
                .map_err(|why| format!("{why} Work the answer out again and state it.")),
        );
        violations.check(
            validate_answer_fraction_provenance(&assessment.question, &assessment.expected_answer)
                .map_err(|detail| {
                    format!("{detail} Ask only about the values the question states.")
                }),
        );
    }
    if covered != objective_ids {
        violations.add("Every lesson objective needs at least one assessment.");
    }
    violations.into_report(NAME)
}

/// Explanations are teacher-facing prose. "Knowledge component" is the lesson's
/// internal planning vocabulary — model plumbing the contract keeps out of the
/// customer interface — so prose that names it must be rewritten in plain words.
/// Instructional materials are the aids a teacher brings to the room — charts, number cards,
/// a worksheet — not the source files graspy drew the lesson from. A figure
/// filename, a link, a licence line, or a raw excerpt is a source artefact and
/// must never be handed to a teacher as something to bring to class.
pub(super) fn reject_source_artifact_material(material: &str) -> Result<(), String> {
    let lowered = material.trim().to_lowercase();
    let is_asset_file = [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".pdf"]
        .iter()
        .any(|extension| lowered.ends_with(extension));
    let is_source = lowered.contains("http://")
        || lowered.contains("https://")
        || lowered.contains("www.")
        || lowered.contains("licensed under")
        || lowered.contains("creative commons")
        || lowered.starts_with("excerpt:")
        || lowered.starts_with("figure ");
    if is_asset_file || is_source {
        return Err(format!(
            "A teaching material, \"{}\", names a source file or citation rather than something a teacher brings to class. List classroom aids — charts, number cards, a worksheet — not figures, links, or sources.",
            material.trim()
        ));
    }
    Ok(())
}

pub(super) fn validate_core_instruction_plan(input: &Value, output: &Value) -> ValidationReport {
    const NAME: &str = "core-instruction-plan-alignment";
    let parsed = (|| {
        Ok::<_, String>((
            parse_validation::<GranularLessonProgramInput>(&input["lesson"])?,
            parse_validation::<BoundObjectivePlan>(&input["objectivePlan"])?,
            parse_validation::<KnowledgePlan>(&input["knowledgePlan"])?,
        ))
    })();
    let (lesson, objectives, knowledge) = match parsed {
        Ok(values) => values,
        Err(error) => return Violations::single(error).into_report(NAME),
    };
    let output = match normalized_core_instruction_plan(output) {
        Ok(output) => output,
        Err(error) => {
            return Violations::single(
                error
                    .diagnostics
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "The core instruction plan is invalid.".to_owned()),
            )
            .into_report(NAME);
        }
    };
    // The per-step checks read objectives by position, so a count mismatch makes
    // them meaningless; it is reported on its own.
    if output.core_steps.len() != objectives.lesson_objectives.len() {
        return Violations::single(format!(
            "Draft exactly {} core steps, one for each lesson objective in the supplied order.",
            objectives.lesson_objectives.len()
        ))
        .into_report(NAME);
    }
    let selected = knowledge
        .objective_knowledge
        .iter()
        .map(|value| {
            (
                value.lesson_objective_id.as_str(),
                value.knowledge_component_id.as_str(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let components = lesson
        .curriculum_snapshot
        .knowledge_components
        .iter()
        .map(|value| (value.id.as_str(), value))
        .collect::<BTreeMap<_, _>>();
    let mut violations = Violations::default();
    for (index, step) in output.core_steps.iter().enumerate() {
        let objective = &objectives.lesson_objectives[index];
        let Ok(expected_sequence) = u16::try_from(index + 1) else {
            violations.add("There are too many core lesson steps.");
            continue;
        };
        if step.lesson_objective_sequence != expected_sequence
            || step.title.trim().is_empty()
            || step.summary.trim().is_empty()
            || step.teacher_activities.is_empty()
            || step
                .teacher_activities
                .iter()
                .any(|activity| activity.trim().is_empty())
            || step.learner_activities.is_empty()
            || step
                .learner_activities
                .iter()
                .any(|activity| activity.trim().is_empty())
            || step.explanations.is_empty()
            || step
                .explanations
                .iter()
                .any(|explanation| explanation.trim().is_empty())
        {
            violations.add(
                "Each core step must stay aligned and include complete explanation, teacher activity, and learner activity.",
            );
        }
        let shown_problems = step
            .worked_examples
            .iter()
            .map(|example| example.problem.as_str())
            .collect::<Vec<_>>();
        for explanation in &step.explanations {
            violations.check(
                reject_generation_narration(explanation)
                    .map_err(|message| format!("Core step {expected_sequence}: {message}")),
            );
            violations.check(
                reject_explanation_echoing_example(explanation, &shown_problems)
                    .map_err(|message| format!("Core step {expected_sequence}: {message}")),
            );
        }
        let Some(component_id) = selected.get(objective.id.as_str()) else {
            violations.add("A core step has no knowledge selection.");
            continue;
        };
        let Some(component) = components.get(component_id) else {
            violations.add("A core step uses unavailable knowledge.");
            continue;
        };
        let requires_demonstration = matches!(
            component.knowledge_type,
            KnowledgeType::Procedure | KnowledgeType::Representation
        );
        if requires_demonstration && step.worked_examples.is_empty() {
            violations.add(format!(
                "Core step {expected_sequence} needs a complete worked example."
            ));
        }
        for example in &step.worked_examples {
            if example.problem.trim().is_empty()
                || example.final_answer.trim().is_empty()
                || example.steps.is_empty()
                || example.steps.iter().any(|worked_step| {
                    worked_step.label.trim().is_empty() || worked_step.content.trim().is_empty()
                })
            {
                violations.add(format!(
                    "Core step {expected_sequence} has an incomplete worked example."
                ));
                continue;
            }
            violations.check(validate_lesson_question_text(&example.problem).map_err(|message| {
                format!(
                    "Core step {expected_sequence}: {message} Rewrite that worked example's problem so a learner can follow it."
                )
            }));
            violations.check(
                validate_fraction_ordering_worked_example(
                    &objective.statement,
                    &example.problem,
                    &example.final_answer,
                )
                .map_err(|message| format!("Core step {expected_sequence}: {message}")),
            );
        }
        let mut selected_figures = BTreeSet::new();
        for figure_sequence in &step.figure_sequences {
            let within_evidence = sequence_index(*figure_sequence).is_ok_and(|position| {
                lesson
                    .source_evidence_snapshot
                    .figures
                    .get(position)
                    .is_some()
            });
            if !selected_figures.insert(*figure_sequence) || !within_evidence {
                violations.add("A core step requested a visual outside the supplied evidence.");
            }
        }
    }
    violations.into_report(NAME)
}

pub(super) fn validate_core_practice_plan(input: &Value, output: &Value) -> ValidationReport {
    const NAME: &str = "core-practice-plan-alignment";
    let parsed = (|| {
        Ok::<_, String>((
            parse_validation::<BoundObjectivePlan>(&input["objectivePlan"])?,
            parse_validation::<CoreInstructionPlan>(&input["coreInstructionPlan"])?,
        ))
    })();
    let (objectives, instruction_plan) = match parsed {
        Ok(values) => values,
        Err(error) => return Violations::single(error).into_report(NAME),
    };
    let output = match normalized_core_practice_plan(output) {
        Ok(output) => output,
        Err(error) => {
            return Violations::single(
                error
                    .diagnostics
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "The core practice plan is invalid.".to_owned()),
            )
            .into_report(NAME);
        }
    };
    // The per-step checks read objectives and instruction steps by position, so a
    // count mismatch makes them meaningless; it is reported on its own.
    if output.core_steps.len() != objectives.lesson_objectives.len() {
        return Violations::single(format!(
            "Create exactly {} practice steps, one for each lesson objective in the supplied order.",
            objectives.lesson_objectives.len()
        ))
        .into_report(NAME);
    }
    let worked_example_value_sets = instruction_plan
        .core_steps
        .iter()
        .flat_map(|step| &step.worked_examples)
        .filter_map(|example| fraction_ordering_value_set_signature(&example.problem))
        .collect::<BTreeSet<_>>();
    let mut practice_value_sets = BTreeSet::new();
    let mut violations = Violations::default();
    for (index, practice_step) in output.core_steps.iter().enumerate() {
        let Ok(expected_sequence) = u16::try_from(index + 1) else {
            violations.add("There are too many core practice steps.");
            continue;
        };
        if practice_step.lesson_objective_sequence != expected_sequence
            || practice_step.practice_questions.is_empty()
        {
            violations.add(format!(
                "Practice step {expected_sequence} must match its objective and include at least one question."
            ));
            continue;
        }
        let objective = &objectives.lesson_objectives[index];
        let Some(instruction_step) = instruction_plan.core_steps.get(index) else {
            violations.add("A practice step has no immutable instruction step.");
            continue;
        };
        let worked_example_problems = instruction_step
            .worked_examples
            .iter()
            .map(|example| example.problem.as_str())
            .collect::<Vec<_>>();
        for practice in &practice_step.practice_questions {
            if practice.question.trim().is_empty() || practice.expected_answer.trim().is_empty() {
                violations.add(format!(
                    "Practice step {expected_sequence} has an incomplete question or answer."
                ));
                continue;
            }
            violations.check(validate_lesson_question_text(&practice.question).map_err(|message| {
                format!(
                    "Practice step {expected_sequence}: {message} Rewrite that practice question's text so a learner can act on it."
                )
            }));
            violations.check(
                reject_practice_repeating_example(&practice.question, &worked_example_problems)
                    .map_err(|message| format!("Practice step {expected_sequence}: {message}")),
            );
            violations.check(
                validate_fraction_ordering_practice(
                    &objective.statement,
                    &worked_example_problems,
                    &practice.question,
                    &practice.expected_answer,
                )
                .map_err(|message| {
                    format!(
                        "Practice step {expected_sequence}: {message} Replace only the practice operands with a new solvable fraction set and recalculate its expected answer."
                    )
                }),
            );
            violations.check(
                validate_fraction_ordering_hints(&practice.question, &practice.hints).map_err(
                    |message| {
                        format!(
                            "Practice step {expected_sequence}: {message} Rewrite only that practice step's hints using its own operands."
                        )
                    },
                ),
            );
            if let Some(value_set) = fraction_ordering_value_set_signature(&practice.question) {
                if worked_example_value_sets.contains(&value_set) {
                    violations.add(format!(
                        "Practice step {expected_sequence} repeats fraction values from a worked example elsewhere in the lesson. Replace only the practice operands with a new solvable fraction set and recalculate its expected answer."
                    ));
                } else if !practice_value_sets.insert(value_set) {
                    violations.add(format!(
                        "Practice step {expected_sequence} repeats fraction values already used by another practice step. Replace only this practice's operands with a new solvable fraction set and recalculate its expected answer."
                    ));
                }
            }
        }
    }
    violations.into_report(NAME)
}

#[cfg(test)]
pub(super) fn validate_core_step_plan(input: &Value, output: &Value) -> ValidationReport {
    let result = (|| {
        let lesson = parse_validation::<GranularLessonProgramInput>(&input["lesson"])?;
        let objectives = parse_validation::<BoundObjectivePlan>(&input["objectivePlan"])?;
        let knowledge = parse_validation::<KnowledgePlan>(&input["knowledgePlan"])?;
        let output = normalize_core_step_plan(parse_validation::<CoreStepPlan>(output)?);
        if output.core_steps.len() != objectives.lesson_objectives.len() {
            return Err(format!(
                "Draft exactly {} core steps, one for each lesson objective in the supplied order.",
                objectives.lesson_objectives.len()
            ));
        }
        let selected = knowledge
            .objective_knowledge
            .iter()
            .map(|value| {
                (
                    value.lesson_objective_id.as_str(),
                    value.knowledge_component_id.as_str(),
                )
            })
            .collect::<BTreeMap<_, _>>();
        let components = lesson
            .curriculum_snapshot
            .knowledge_components
            .iter()
            .map(|value| (value.id.as_str(), value))
            .collect::<BTreeMap<_, _>>();
        for (index, step) in output.core_steps.iter().enumerate() {
            let objective = &objectives.lesson_objectives[index];
            let expected_sequence = u16::try_from(index + 1)
                .map_err(|_| "There are too many core lesson steps.".to_owned())?;
            let component_id = selected
                .get(objective.id.as_str())
                .ok_or_else(|| "A core step has no knowledge selection.".to_owned())?;
            let component = components
                .get(component_id)
                .ok_or_else(|| "A core step uses unavailable knowledge.".to_owned())?;
            if step.lesson_objective_sequence != expected_sequence
                || step.title.trim().is_empty()
                || step.summary.trim().is_empty()
                || step.teacher_activities.is_empty()
                || step
                    .teacher_activities
                    .iter()
                    .any(|activity| activity.trim().is_empty())
                || step.learner_activities.is_empty()
                || step
                    .learner_activities
                    .iter()
                    .any(|activity| activity.trim().is_empty())
            {
                return Err(
                    "Each core step must stay aligned and describe teacher and learner activity."
                        .to_owned(),
                );
            }
            if step.explanations.is_empty()
                || step
                    .explanations
                    .iter()
                    .any(|explanation| explanation.trim().is_empty())
            {
                return Err("Every core step needs an explanation.".to_owned());
            }
            let requires_full_demonstration = matches!(
                component.knowledge_type,
                KnowledgeType::Procedure | KnowledgeType::Representation
            );
            let demonstration_is_incomplete = step.worked_examples.is_empty()
                || step.practice_questions.is_empty()
                || step.worked_examples.iter().any(|example| {
                    example.problem.trim().is_empty()
                        || example.steps.is_empty()
                        || example.steps.iter().any(|worked_step| {
                            worked_step.label.trim().is_empty()
                                || worked_step.content.trim().is_empty()
                        })
                        || example.final_answer.trim().is_empty()
                })
                || step.practice_questions.iter().any(|practice| {
                    practice.question.trim().is_empty()
                        || practice.expected_answer.trim().is_empty()
                });
            if requires_full_demonstration && demonstration_is_incomplete {
                return Err("Procedure and representation steps need a worked example and aligned practice.".to_owned());
            }
            for example in &step.worked_examples {
                validate_lesson_question_text(&example.problem).map_err(|message| {
                    format!(
                        "Core step {expected_sequence}: {message} Rewrite that worked example's problem so a learner can follow it."
                    )
                })?;
                validate_fraction_ordering_worked_example(
                    &objective.statement,
                    &example.problem,
                    &example.final_answer,
                )
                .map_err(|message| format!("Core step {expected_sequence}: {message}"))?;
                check_answer(&example.problem, &example.final_answer)
                    .only_when_wrong()
                    .map_err(|why| {
                        format!("Core step {expected_sequence}: {why} Work the answer out again and state it.")
                    })?;
            }
            let worked_example_problems = step
                .worked_examples
                .iter()
                .map(|example| example.problem.as_str())
                .collect::<Vec<_>>();
            for practice in &step.practice_questions {
                validate_lesson_question_text(&practice.question).map_err(|message| {
                    format!(
                        "Core step {expected_sequence}: {message} Rewrite that practice question's text so a learner can act on it."
                    )
                })?;
                validate_fraction_ordering_practice(
                    &objective.statement,
                    &worked_example_problems,
                    &practice.question,
                    &practice.expected_answer,
                )
                .map_err(|message| {
                    format!(
                        "Core step {expected_sequence}: {message} Replace the practice operands with a new solvable fraction set, recalculate the expected answer, and keep the worked example unchanged."
                    )
                })?;
                check_answer(&practice.question, &practice.expected_answer)
                    .only_when_wrong()
                    .map_err(|why| {
                        format!("Core step {expected_sequence}: {why} Work the answer out again and state it.")
                    })?;
            }
            let mut selected_figures = BTreeSet::new();
            for figure_sequence in &step.figure_sequences {
                if !selected_figures.insert(*figure_sequence)
                    || lesson
                        .source_evidence_snapshot
                        .figures
                        .get(sequence_index(*figure_sequence)?)
                        .is_none()
                {
                    return Err(
                        "A core step requested a visual outside the supplied evidence.".to_owned(),
                    );
                }
            }
        }
        Ok(())
    })();
    validation_result("core-step-plan-alignment", result)
}

fn decode_report<T: DeserializeOwned>(output: &Value, name: &str) -> ValidationReport {
    match serde_json::from_value::<T>(output.clone()) {
        Ok(_) => ValidationReport::pass(name),
        Err(error) => {
            ValidationReport::new(vec![ValidationCheck::fail(name, vec![error.to_string()])])
        }
    }
}

/// The combined core-step validator is a test aggregate; production stages report
/// every violation through [`Violations`].
#[cfg(test)]
fn validation_result(name: &str, result: Result<(), String>) -> ValidationReport {
    match result {
        Ok(()) => ValidationReport::pass(name),
        Err(error) => ValidationReport::new(vec![ValidationCheck::fail(name, vec![error])]),
    }
}

/// Every violation a stage validator finds, reported together so one repair can
/// address them all rather than the run trading an attempt per problem. Structural
/// prerequisites (a candidate that will not parse) still stop the pass — there is
/// nothing further to check — but content faults accumulate.
#[derive(Default)]
struct Violations(Vec<String>);

impl Violations {
    fn single(message: impl Into<String>) -> Self {
        Self(vec![message.into()])
    }

    fn add(&mut self, message: impl Into<String>) {
        self.0.push(message.into());
    }

    fn check(&mut self, outcome: Result<(), String>) {
        if let Err(message) = outcome {
            self.0.push(message);
        }
    }

    fn extend(&mut self, messages: impl IntoIterator<Item = String>) {
        self.0.extend(messages);
    }

    fn into_report(self, name: &str) -> ValidationReport {
        if self.0.is_empty() {
            ValidationReport::pass(name)
        } else {
            ValidationReport::new(vec![ValidationCheck::fail(name, self.0)])
        }
    }
}

fn parse_validation<T: DeserializeOwned>(value: &Value) -> Result<T, String> {
    serde_json::from_value(value.clone()).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    use crate::lesson_planning::program::test_support::*;
    use crate::lesson_planning::program::*;

    #[test]
    fn a_teaching_material_is_a_classroom_aid_not_a_source_file() {
        for aid in [
            "Charts of numbers in millions and billions, flash cards",
            "Place-value chart to millions",
            "20-item worksheet",
            "Number cards",
        ] {
            assert!(
                reject_source_artifact_material(aid).is_ok(),
                "a classroom aid is accepted: {aid}",
            );
        }
        for artefact in [
            "ebw-jss1-01-007.png",
            "ebw-jss1-04-017.PNG",
            "figure 1.3",
            "https://ng.siyavula.com/read",
            "Siyavula Mathematics JSS 1, licensed under Creative Commons Attribution 3.0",
            "Excerpt: If we round off 2,950 to the nearest hundred",
        ] {
            assert!(
                reject_source_artifact_material(artefact).is_err(),
                "a source artefact is rejected: {artefact}",
            );
        }
    }

    #[test]
    fn practice_stage_rejects_values_from_immutable_worked_examples() {
        let (_, _, objectives, _, _, core) = input_and_stage_outputs();
        let (instructions, mut practice) = split_core_plan(core);
        // Reworded rather than copied, so this exercises the value-set rule
        // rather than the plain repeat rule that precedes it.
        practice.core_steps[1].practice_questions[0].question =
            "Arrange 1/2, 2/3 and 3/4 in order from least to greatest.".to_owned();
        practice.core_steps[1].practice_questions[0].expected_answer = "1/2 < 2/3 < 3/4".to_owned();

        let report = validate_core_practice_plan(
            &json!({
                "objectivePlan": objectives,
                "coreInstructionPlan": instructions,
            }),
            &serde_json::to_value(practice).expect("practice plan"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("Practice step 2"));
        assert!(report.checks[0].details[0].contains("different values"));
        assert!(report.checks[0].details[0].contains("Replace only the practice operands"));
    }

    #[test]
    fn practice_stage_rejects_a_value_set_reused_by_another_objective() {
        let (_, _, mut objectives, _, _, core) = input_and_stage_outputs();
        objectives.lesson_objectives[0].statement =
            "Arrange fractions in ascending order.".to_owned();
        objectives.lesson_objectives[1].statement =
            "Arrange fractions in descending order.".to_owned();
        let (instructions, mut practice) = split_core_plan(core);
        practice.core_steps[0].practice_questions[0].question =
            "Arrange 1/4, 1/3 and 1/2 in ascending order.".to_owned();
        practice.core_steps[0].practice_questions[0].expected_answer = "1/4 < 1/3 < 1/2".to_owned();
        practice.core_steps[1].practice_questions[0].question =
            "Arrange 1/2, 1/4 and 1/3 in descending order.".to_owned();
        practice.core_steps[1].practice_questions[0].expected_answer = "1/2 > 1/3 > 1/4".to_owned();

        let report = validate_core_practice_plan(
            &json!({
                "objectivePlan": objectives,
                "coreInstructionPlan": instructions,
            }),
            &serde_json::to_value(practice).expect("practice plan"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("Practice step 2"));
        assert!(report.checks[0].details[0].contains("another practice step"));
    }

    /// Hints copied from the worked example used to fail the lesson. They are now
    /// replaced with hints for the operands the practice question actually states,
    /// so the teacher gets a usable step instead of a failed generation.
    #[test]
    fn core_step_stage_refuses_an_explanation_that_narrates_the_plan() {
        let (lesson, _, objectives, knowledge, _, core) = input_and_stage_outputs();
        let (mut instructions, _) = split_core_plan(core);
        instructions.core_steps[0].explanations[0] =
            "This step focuses on the first objective: ordering fractions.".to_owned();

        let report = validate_core_instruction_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(instructions).expect("instruction plan"),
        );

        assert!(!report.passed);
        assert!(
            report.checks[0]
                .details
                .iter()
                .any(|detail| detail.contains("place in the plan")),
            "unexpected: {:?}",
            report.checks[0].details,
        );
    }

    #[test]
    fn practice_stage_refuses_the_worked_example_handed_back_as_practice() {
        let (_, _, objectives, _, _, core) = input_and_stage_outputs();
        let (instructions, mut practice) = split_core_plan(core);
        let shown = instructions.core_steps[1].worked_examples[0]
            .problem
            .clone();
        practice.core_steps[1].practice_questions[0].question = shown;

        let report = validate_core_practice_plan(
            &json!({
                "objectivePlan": objectives,
                "coreInstructionPlan": instructions,
            }),
            &serde_json::to_value(practice).expect("practice plan"),
        );

        assert!(!report.passed);
        assert!(
            report.checks[0].details[0].contains("repeats the worked example"),
            "unexpected: {:?}",
            report.checks[0].details,
        );
    }

    #[test]
    fn rejects_a_core_step_without_the_required_procedure_blocks() {
        let (lesson, _, objectives, knowledge, _, mut core) = input_and_stage_outputs();
        core.core_steps[1].worked_examples.clear();
        let report = validate_core_step_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(core).expect("core output"),
        );
        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("worked example"));
    }

    /// A prepared lesson is teacher-facing. When an explanation names the lesson's
    /// internal planning vocabulary — "the knowledge component" — the instruction
    /// stage rejects it so the idea is retold in a learner's words.
    #[test]
    fn rejects_an_explanation_that_names_the_internal_planning_vocabulary() {
        let (lesson, _, objectives, knowledge, _, core) = input_and_stage_outputs();
        let (mut instruction_plan, _) = split_core_plan(core);
        instruction_plan.core_steps[0].explanations[0] =
            "Use place-value patterns to count forward, as suggested by the knowledge component."
                .to_owned();

        let report = validate_core_instruction_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(instruction_plan).expect("instruction output"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("plain words"));
    }

    #[test]
    fn rejects_prerequisite_only_practice_for_an_ordering_objective() {
        let (lesson, _, objectives, knowledge, _, mut core) = input_and_stage_outputs();
        core.core_steps[1].practice_questions = vec![GeneratedPractice {
            question: "Find the LCM of the denominators 2, 3, and 4.".to_owned(),
            expected_answer: "The LCM is 12.".to_owned(),
            hints: vec!["List the multiples of each denominator.".to_owned()],
        }];

        let report = validate_core_step_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(core).expect("core output"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("Core step 2"));
        assert!(report.checks[0].details[0].contains("must ask learners to order fractions"));
        assert!(report.checks[0].details[0].contains("Replace the practice operands"));
    }

    #[test]
    fn identifies_the_core_step_whose_practice_repeats_the_worked_example() {
        let (lesson, _, objectives, knowledge, _, mut core) = input_and_stage_outputs();
        core.core_steps[1].practice_questions[0].question =
            "Order 1/2, 2/3 and 3/4 from least to greatest.".to_owned();
        core.core_steps[1].practice_questions[0].expected_answer = "1/2 < 2/3 < 3/4".to_owned();

        let report = validate_core_step_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(core).expect("core output"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("Core step 2"));
        assert!(report.checks[0].details[0].contains("different values"));
        assert!(report.checks[0].details[0].contains("keep the worked example unchanged"));
    }

    #[test]
    fn rejects_an_assessment_answer_that_states_a_fraction_its_question_never_asks_about() {
        let (lesson, _, objectives, knowledge, mut assessments, _) = input_and_stage_outputs();
        assessments.assessments[1].question = "Compare 1/2, 1/3 and 1/4.".to_owned();
        assessments.assessments[1].expected_answer = "1/5 is the smallest.".to_owned();

        let report = validate_assessment_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(assessments).expect("assessment output"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("1/5"));
    }

    #[test]
    fn rejects_an_assessment_question_a_learner_cannot_act_on() {
        let (lesson, _, objectives, knowledge, mut assessments, _) = input_and_stage_outputs();
        assessments.assessments[1].question =
            "Compare the following two fractions using a common representation (e.g., a number \
             line or by finding a common denominator). Show your steps:\n\n1/2 ≈ ≈ 2/4"
                .to_owned();

        let report = validate_assessment_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(assessments).expect("assessment output"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("≈ ≈"));
    }

    /// The observed defect: the assessment stage echoed a knowledge-component
    /// description into the expected answer, so the lesson showed a learning goal
    /// where the answer belongs. The render-stage validator must refuse it.
    #[test]
    fn rejects_an_assessment_answer_that_restates_a_knowledge_component() {
        let (lesson, _, objectives, knowledge, mut assessments, _) = input_and_stage_outputs();
        let echoed = lesson
            .curriculum_snapshot
            .knowledge_components
            .first()
            .expect("a knowledge component")
            .description
            .clone();
        assessments.assessments[0].question =
            "Explain, in your own words, what you learned in this lesson.".to_owned();
        assessments.assessments[0].expected_answer = echoed;

        let report = validate_assessment_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(assessments).expect("assessment output"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("restates a learning goal"));
    }

    /// The draft stage is the earliest place to catch the echo. Here the answer
    /// restates the objective statement rather than answering the question.
    #[test]
    fn the_draft_stage_rejects_an_answer_that_restates_a_learning_goal() {
        let (lesson, _, objectives, _, assessments, _) = input_and_stage_outputs();
        let mut drafted = DraftedAssessmentPlan {
            assessments: assessments
                .assessments
                .iter()
                .map(|assessment| DraftedAssessment {
                    lesson_objective_sequence: objectives
                        .lesson_objectives
                        .iter()
                        .find(|objective| objective.id == assessment.lesson_objective_id)
                        .expect("an objective for every assessment")
                        .sequence,
                    question: assessment.question.clone(),
                    expected_answer: assessment.expected_answer.clone(),
                    bloom_level: assessment.bloom_level,
                    rubric: assessment.rubric.clone(),
                })
                .collect(),
        };
        drafted.assessments[0].expected_answer = objectives.lesson_objectives[0].statement.clone();

        let report = validate_drafted_assessments(
            &json!({ "lesson": lesson, "objectivePlan": objectives }),
            &serde_json::to_value(drafted).expect("drafted output"),
        );

        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("restates a learning goal"));
    }

    /// A billions question answered in millions, found in a real lesson. The
    /// prose reads correctly beside the wrong digits, so nothing but arithmetic
    /// catches it — and it has to reach the stage, not merely exist in a module,
    /// or the run never repairs.
    #[test]
    fn the_draft_stage_rejects_an_answer_written_at_the_wrong_scale() {
        let (lesson, _, objectives, _, assessments, _) = input_and_stage_outputs();
        let mut drafted = DraftedAssessmentPlan {
            assessments: assessments
                .assessments
                .iter()
                .map(|assessment| DraftedAssessment {
                    lesson_objective_sequence: objectives
                        .lesson_objectives
                        .iter()
                        .find(|objective| objective.id == assessment.lesson_objective_id)
                        .expect("an objective for every assessment")
                        .sequence,
                    question: assessment.question.clone(),
                    expected_answer: assessment.expected_answer.clone(),
                    bloom_level: assessment.bloom_level,
                    rubric: assessment.rubric.clone(),
                })
                .collect(),
        };
        drafted.assessments[0].question =
            "Count in 0.5 billions from 10.5 billion to 12 billion. Write the numbers as digits."
                .to_owned();
        drafted.assessments[0].expected_answer =
            "The numbers are: 10,500,000, 11,000,000, and 12,000,000.".to_owned();

        let report = validate_drafted_assessments(
            &json!({ "lesson": lesson, "objectivePlan": objectives }),
            &serde_json::to_value(drafted).expect("drafted output"),
        );

        assert!(!report.passed);
        assert!(
            report.checks[0].details[0].contains("factor of a thousand"),
            "unexpected: {:?}",
            report.checks[0].details,
        );
    }

    /// A run that counts in ones where threes were asked for slips no scale and
    /// writes no fraction, so it reached the teacher and failed only when the
    /// lesson was saved — after the wait, with nothing offered to fix it.
    /// Caught at the stage, it is a repair the model still has an attempt for.
    #[test]
    fn the_draft_stage_rejects_a_run_that_counts_the_wrong_way() {
        let (lesson, _, objectives, _, assessments, _) = input_and_stage_outputs();
        let mut drafted = DraftedAssessmentPlan {
            assessments: assessments
                .assessments
                .iter()
                .map(|assessment| DraftedAssessment {
                    lesson_objective_sequence: objectives
                        .lesson_objectives
                        .iter()
                        .find(|objective| objective.id == assessment.lesson_objective_id)
                        .expect("an objective for every assessment")
                        .sequence,
                    question: assessment.question.clone(),
                    expected_answer: assessment.expected_answer.clone(),
                    bloom_level: assessment.bloom_level,
                    rubric: assessment.rubric.clone(),
                })
                .collect(),
        };
        drafted.assessments[0].question =
            "Count in 3 trillions from 987 trillion to 999 trillion. Write the numbers.".to_owned();
        drafted.assessments[0].expected_answer =
            "987 trillion, 988 trillion, 989 trillion, 990 trillion.".to_owned();

        let report = validate_drafted_assessments(
            &json!({ "lesson": lesson, "objectivePlan": objectives }),
            &serde_json::to_value(drafted).expect("drafted output"),
        );

        assert!(!report.passed);
        let said = report.checks[0].details.join(" ");
        assert!(
            said.contains("993,000,000,000,000") || said.contains("counts through"),
            "the repair has to be told what is wrong: {said}",
        );
    }

    /// Two assessments, two unrelated faults. A validator that stopped at the
    /// first would send the run back to fix one, spend the attempt, and only then
    /// meet the second. Reporting both lets one repair settle them together.
    #[test]
    fn reports_every_assessment_violation_not_only_the_first() {
        let (lesson, _, objectives, knowledge, mut assessments, _) = input_and_stage_outputs();
        let echoed = lesson
            .curriculum_snapshot
            .knowledge_components
            .first()
            .expect("a knowledge component")
            .description
            .clone();
        assessments.assessments[0].question =
            "Explain, in your own words, what you learned in this lesson.".to_owned();
        assessments.assessments[0].expected_answer = echoed;
        assessments.assessments[1].question =
            "Compare the following two fractions using a common representation (e.g., a number \
             line or by finding a common denominator). Show your steps:\n\n1/2 ≈ ≈ 2/4"
                .to_owned();

        let report = validate_assessment_plan(
            &json!({
                "lesson": lesson,
                "objectivePlan": objectives,
                "knowledgePlan": knowledge,
            }),
            &serde_json::to_value(assessments).expect("assessment output"),
        );

        assert!(!report.passed);
        let details = &report.checks[0].details;
        assert!(
            details.len() >= 2,
            "both faults are reported in one pass, got {details:?}"
        );
        assert!(details
            .iter()
            .any(|detail| detail.contains("restates a learning goal")));
        assert!(details.iter().any(|detail| detail.contains("≈ ≈")));
    }

    #[test]
    fn rejects_an_objective_outside_the_supplied_order() {
        let (lesson, mut objectives, _, _, _, _) = input_and_stage_outputs();
        objectives.lesson_objectives[0].sequence = 2;
        let report = validate_objective_plan(
            &serde_json::to_value(lesson).expect("lesson input"),
            &serde_json::to_value(objectives).expect("objective output"),
        );
        assert!(!report.passed);
        assert!(report.checks[0].details[0].contains("order"));
    }

    #[test]
    fn practice_stage_rewrites_hints_copied_from_a_worked_example() {
        let (_, _, objectives, _, _, core) = input_and_stage_outputs();
        let (instructions, mut practice) = split_core_plan(core);
        practice.core_steps[1].practice_questions[0].hints =
            vec!["Find the LCM of the denominators (2, 3, 4).".to_owned()];

        let report = validate_core_practice_plan(
            &json!({
                "objectivePlan": objectives,
                "coreInstructionPlan": instructions,
            }),
            &serde_json::to_value(practice.clone()).expect("practice plan"),
        );
        assert!(report.passed, "{:?}", report.checks);

        let settled =
            normalized_core_practice_plan(&serde_json::to_value(practice).expect("practice plan"))
                .expect("normalized practice plan");
        let hints = &settled.core_steps[1].practice_questions[0].hints;
        assert_eq!(hints.len(), 3);
        assert!(
            !hints.iter().any(|hint| hint.contains("(2, 3, 4)")),
            "the worked example's denominators must not survive: {hints:?}"
        );
    }
}
