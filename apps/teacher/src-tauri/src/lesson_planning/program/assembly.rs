//! The deterministic node bodies that complete reviewed drafts and assemble the
//! staged plans into the final lesson.

use super::normalization::assessments_from_drafts;
use super::validation::{validate_assessment_plan, validate_core_practice_plan};
use super::{
    deterministic_fault, parse, sequence_index, AssessmentPlan, BoundObjectivePlan,
    CoreInstructionPlan, CorePracticePlan, CoreStepPlan, EvidencePlan, GeneratedCoreStep,
    GeneratedPractice, GranularLessonProgramInput, KnowledgePlan, PROGRAM_ID, PROGRAM_VERSION,
};
use crate::generation_program::domain::RuntimeFault;
use crate::lesson_planning::granular::{
    AssessmentItem, BloomLevel, GranularLessonPlan, GranularLessonRecord, LessonContentBlock,
    LessonObjective, LessonPlanStep, LessonProgramSnapshot, LessonReference, LessonStepRole,
    SourceEvidenceSnapshot,
};
use crate::lesson_planning::mathematics::{
    canonical_fraction_answer, fraction_ordering_practice_hints,
    fraction_ordering_value_set_signature, has_same_fraction_ordering_direction,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn complete_reviewed_assessments(input: &Value) -> Result<Value, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(&input["lesson"], "lesson-planning input")?;
    let objectives = parse::<BoundObjectivePlan>(&input["objectivePlan"], "objective plan")?;
    let knowledge = parse::<KnowledgePlan>(&input["knowledgePlan"], "knowledge plan")?;
    let mut plan = assessments_from_drafts(
        &input["draftAssessmentPlan"],
        &lesson,
        &objectives,
        &knowledge,
    )?;
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

    for record in &lesson.source_evidence_snapshot.records {
        let title = record.title.to_lowercase();
        if !title.contains("worked example") && !title.contains("exercise") {
            continue;
        }
        let Some(required_values) = fraction_ordering_value_set_signature(&record.excerpt) else {
            continue;
        };
        let required_answer = canonical_fraction_answer(&record.excerpt).ok_or_else(|| {
            deterministic_fault(vec![
                "A reviewed fraction-ordering task is incomplete.".to_owned()
            ])
        })?;
        let preserved = plan.assessments.iter().any(|assessment| {
            assessment.supporting_record_ids.contains(&record.record_id)
                && fraction_ordering_value_set_signature(&assessment.question)
                    .is_some_and(|values| values == required_values)
                && canonical_fraction_answer(&assessment.question)
                    .is_some_and(|answer| answer == required_answer)
        });
        if preserved {
            continue;
        }

        let objective = objectives
            .lesson_objectives
            .iter()
            .find(|objective| {
                has_same_fraction_ordering_direction(&objective.statement, &record.excerpt)
            })
            .ok_or_else(|| {
                deterministic_fault(vec![format!(
                    "Reviewed task {} has no lesson objective with the same ordering direction.",
                    record.record_id
                )])
            })?;
        let knowledge_component_id =
            alignment
                .get(objective.id.as_str())
                .copied()
                .ok_or_else(|| {
                    deterministic_fault(vec![format!(
                        "Reviewed task {} has no aligned lesson knowledge.",
                        record.record_id
                    )])
                })?;
        let question = record
            .excerpt
            .lines()
            .skip_while(|line| {
                let line = line.to_lowercase();
                !line.contains("arrange") && !line.contains("order")
            })
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_owned();
        plan.assessments.push(AssessmentItem {
            id: format!("assessment-reviewed-{}", record.record_id),
            lesson_objective_id: objective.id.clone(),
            knowledge_component_id: knowledge_component_id.to_owned(),
            question,
            expected_answer: required_answer,
            bloom_level: BloomLevel::Apply,
            rubric: vec![
                "Uses a valid common denominator or equivalent comparison method.".to_owned(),
                "Includes every fraction from the question.".to_owned(),
                "States the fractions in the requested order.".to_owned(),
            ],
            supporting_record_ids: vec![record.record_id.clone()],
        });
    }

    let encoded = encode(&plan, "completed assessment plan")?;
    let report = validate_assessment_plan(input, &encoded);
    if !report.passed {
        return Err(deterministic_fault(
            report
                .checks
                .into_iter()
                .flat_map(|check| check.details)
                .collect(),
        ));
    }
    Ok(encoded)
}

pub(super) fn complete_reviewed_practice(input: &Value) -> Result<Value, RuntimeFault> {
    let lesson = parse_field::<GranularLessonProgramInput>(input, "lesson")?;
    let objectives = parse_field::<BoundObjectivePlan>(input, "objectivePlan")?;
    let assessments = parse_field::<AssessmentPlan>(input, "assessmentPlan")?;
    let instruction_plan = parse_field::<CoreInstructionPlan>(input, "coreInstructionPlan")?;
    let mut practice_plan = parse_field::<CorePracticePlan>(input, "draftCorePracticePlan")?;
    let source_titles = lesson
        .source_evidence_snapshot
        .records
        .iter()
        .map(|record| (record.record_id.as_str(), record.title.to_lowercase()))
        .collect::<BTreeMap<_, _>>();
    let worked_example_value_sets = instruction_plan
        .core_steps
        .iter()
        .flat_map(|step| &step.worked_examples)
        .filter_map(|example| fraction_ordering_value_set_signature(&example.problem))
        .collect::<BTreeSet<_>>();
    let mut selected_value_sets = BTreeSet::new();

    for objective in &objectives.lesson_objectives {
        let reviewed_questions = assessments
            .assessments
            .iter()
            .filter(|assessment| assessment.lesson_objective_id == objective.id)
            .filter(|assessment| {
                assessment.supporting_record_ids.iter().any(|record_id| {
                    source_titles
                        .get(record_id.as_str())
                        .is_some_and(|title| title.contains("exercise"))
                })
            })
            .filter_map(|assessment| {
                let value_set = fraction_ordering_value_set_signature(&assessment.question)?;
                if worked_example_value_sets.contains(&value_set)
                    || !selected_value_sets.insert(value_set)
                {
                    return None;
                }
                Some(GeneratedPractice {
                    question: assessment.question.clone(),
                    expected_answer: canonical_fraction_answer(&assessment.question)
                        .unwrap_or_else(|| assessment.expected_answer.clone()),
                    hints: fraction_ordering_practice_hints(&assessment.question)
                        .unwrap_or_default(),
                })
            })
            .collect::<Vec<_>>();
        if reviewed_questions.is_empty() {
            continue;
        }
        let practice_step = practice_plan
            .core_steps
            .iter_mut()
            .find(|step| step.lesson_objective_sequence == objective.sequence)
            .ok_or_else(|| {
                deterministic_fault(vec![format!(
                    "Reviewed practice for objective {} has no matching practice step.",
                    objective.id
                )])
            })?;
        practice_step.practice_questions = reviewed_questions;
    }

    let encoded = encode(&practice_plan, "completed core-practice plan")?;
    let report = validate_core_practice_plan(input, &encoded);
    if !report.passed {
        return Err(deterministic_fault(
            report
                .checks
                .into_iter()
                .flat_map(|check| check.details)
                .collect(),
        ));
    }
    Ok(encoded)
}

pub(super) fn assemble_core_step_plan(input: &Value) -> Result<Value, RuntimeFault> {
    let instruction_plan = parse_field::<CoreInstructionPlan>(input, "coreInstructionPlan")?;
    let practice_plan = parse_field::<CorePracticePlan>(input, "corePracticePlan")?;
    if instruction_plan.core_steps.len() != practice_plan.core_steps.len() {
        return Err(deterministic_fault(vec![
            "Core instruction and practice stages have different objective counts.".to_owned(),
        ]));
    }
    let core_steps = instruction_plan
        .core_steps
        .into_iter()
        .zip(practice_plan.core_steps)
        .map(|(instruction, practice)| {
            if instruction.lesson_objective_sequence != practice.lesson_objective_sequence {
                return Err(deterministic_fault(vec![
                    "Core instruction and practice stages are out of objective order.".to_owned(),
                ]));
            }
            Ok(GeneratedCoreStep {
                lesson_objective_sequence: instruction.lesson_objective_sequence,
                title: instruction.title,
                summary: instruction.summary,
                teacher_activities: instruction.teacher_activities,
                learner_activities: instruction.learner_activities,
                explanations: instruction.explanations,
                worked_examples: instruction.worked_examples,
                practice_questions: practice.practice_questions,
                figure_sequences: instruction.figure_sequences,
            })
        })
        .collect::<Result<Vec<_>, RuntimeFault>>()?;
    encode(&CoreStepPlan { core_steps }, "assembled core-step plan")
}

pub(super) fn plan_evidence(input: &Value) -> Result<Value, RuntimeFault> {
    let input = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let plan = EvidencePlan {
        references: input
            .source_evidence_snapshot
            .records
            .iter()
            .map(|record| LessonReference {
                record_id: record.record_id.clone(),
                title: record.title.clone(),
                attribution: record.attribution.clone(),
            })
            .collect(),
    };
    encode(&plan, "source-evidence plan")
}

pub(super) fn assemble_lesson(input: &Value) -> Result<Value, RuntimeFault> {
    let lesson = parse_field::<GranularLessonProgramInput>(input, "lesson")?;
    let objectives = parse_field::<BoundObjectivePlan>(input, "objectivePlan")?;
    let knowledge = parse_field::<KnowledgePlan>(input, "knowledgePlan")?;
    let assessments = parse_field::<AssessmentPlan>(input, "assessmentPlan")?;
    let evidence = parse_field::<EvidencePlan>(input, "evidencePlan")?;
    let core = parse_field::<CoreStepPlan>(input, "coreStepPlan")?;
    let knowledge_by_objective = knowledge
        .objective_knowledge
        .iter()
        .map(|alignment| {
            (
                alignment.lesson_objective_id.as_str(),
                alignment.knowledge_component_id.as_str(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let lesson_objectives = objectives
        .lesson_objectives
        .iter()
        .map(|objective| {
            let knowledge_component_id = knowledge_by_objective
                .get(objective.id.as_str())
                .ok_or_else(|| {
                    deterministic_fault(vec![format!(
                        "Lesson objective {} has no selected knowledge component.",
                        objective.id
                    )])
                })?;
            Ok(LessonObjective {
                id: objective.id.clone(),
                statement: objective.statement.clone(),
                sequence: objective.sequence,
                curriculum_objective_id: objective.curriculum_objective_id.clone(),
                atomic_objective_id: objective.atomic_objective_id.clone(),
                knowledge_component_id: (*knowledge_component_id).to_owned(),
            })
        })
        .collect::<Result<Vec<_>, RuntimeFault>>()?;

    let (introduction_minutes, evaluation_minutes, core_durations) =
        allocate_minutes(lesson.lesson_duration_minutes, core.core_steps.len())?;
    let introduction_content = knowledge
        .prior_knowledge
        .first()
        .map(|prior| prior.statement.clone())
        .unwrap_or_else(|| {
            format!(
                "Introduce {} and connect it to what learners already know.",
                lesson.topic
            )
        });
    let mut steps = vec![LessonPlanStep {
        id: "lesson-step-introduction".to_owned(),
        sequence: 1,
        role: LessonStepRole::Introduction,
        title: "Connect to prior learning".to_owned(),
        summary: "Establish the lesson purpose and reconnect the knowledge learners will use."
            .to_owned(),
        duration_minutes: introduction_minutes,
        lesson_objective_id: None,
        knowledge_type: None,
        teacher_activities: vec![
            "Share the lesson purpose and check the prior knowledge learners will use.".to_owned(),
        ],
        learner_activities: vec![
            "Recall the relevant prior knowledge and explain one connection to today's lesson."
                .to_owned(),
        ],
        blocks: vec![LessonContentBlock::Explanation {
            id: "lesson-block-introduction".to_owned(),
            content: introduction_content,
        }],
    }];
    for (index, generated) in core.core_steps.iter().enumerate() {
        let objective = lesson_objectives.get(index).ok_or_else(|| {
            deterministic_fault(vec![
                "A generated core step has no lesson objective.".to_owned()
            ])
        })?;
        let blocks = assemble_core_blocks(
            generated,
            &objective.id,
            &lesson.source_evidence_snapshot,
            index + 1,
        )?;
        let component = lesson
            .curriculum_snapshot
            .knowledge_components
            .iter()
            .find(|component| component.id == objective.knowledge_component_id)
            .ok_or_else(|| {
                deterministic_fault(vec![
                    "A lesson objective uses unavailable knowledge.".to_owned()
                ])
            })?;
        steps.push(LessonPlanStep {
            id: format!("lesson-step-core-{}", index + 1),
            sequence: u16::try_from(index + 2).map_err(|_| {
                deterministic_fault(vec!["The lesson has too many core steps.".to_owned()])
            })?,
            role: LessonStepRole::Core,
            title: generated.title.clone(),
            summary: generated.summary.clone(),
            duration_minutes: core_durations[index],
            lesson_objective_id: Some(objective.id.clone()),
            knowledge_type: Some(component.knowledge_type),
            teacher_activities: generated.teacher_activities.clone(),
            learner_activities: generated.learner_activities.clone(),
            blocks,
        });
    }
    let evaluation_blocks = assessments
        .assessments
        .iter()
        .enumerate()
        .map(|(index, assessment)| LessonContentBlock::Practice {
            id: format!("lesson-block-evaluation-{}", index + 1),
            lesson_objective_id: assessment.lesson_objective_id.clone(),
            question: assessment.question.clone(),
            expected_answer: assessment.expected_answer.clone(),
            hints: Vec::new(),
        })
        .collect();
    steps.push(LessonPlanStep {
        id: "lesson-step-evaluation".to_owned(),
        sequence: u16::try_from(steps.len() + 1)
            .map_err(|_| deterministic_fault(vec!["The lesson has too many steps.".to_owned()]))?,
        role: LessonStepRole::Evaluation,
        title: "Check today's learning".to_owned(),
        summary: "Check every lesson objective independently and review the stated reasoning."
            .to_owned(),
        duration_minutes: evaluation_minutes,
        lesson_objective_id: None,
        knowledge_type: None,
        teacher_activities: vec![
            "Give each assessment question and review answers against the marking points."
                .to_owned(),
        ],
        learner_activities: vec![
            "Answer each question independently and show the method or reasoning used.".to_owned(),
        ],
        blocks: evaluation_blocks,
    });

    encode(
        &GranularLessonPlan {
            schema_version: 1,
            topic: lesson.topic,
            subtopic: lesson.subtopic,
            curriculum_objectives: lesson.curriculum_snapshot.objectives,
            atomic_objectives: lesson.curriculum_snapshot.atomic_objectives,
            lesson_objectives,
            knowledge_components: lesson.curriculum_snapshot.knowledge_components,
            misconceptions: knowledge.misconceptions,
            prior_knowledge: knowledge.prior_knowledge,
            instructional_materials: knowledge.instructional_materials,
            references: evidence.references,
            steps,
            assessments: assessments.assessments,
        },
        "assembled lesson",
    )
}

fn assemble_core_blocks(
    step: &GeneratedCoreStep,
    objective_id: &str,
    evidence: &SourceEvidenceSnapshot,
    step_number: usize,
) -> Result<Vec<LessonContentBlock>, RuntimeFault> {
    let mut blocks = Vec::new();
    for content in &step.explanations {
        blocks.push(LessonContentBlock::Explanation {
            id: next_block_id(step_number, blocks.len()),
            content: content.clone(),
        });
    }
    for example in &step.worked_examples {
        blocks.push(LessonContentBlock::WorkedExample {
            id: next_block_id(step_number, blocks.len()),
            problem: example.problem.clone(),
            steps: example.steps.clone(),
            final_answer: example.final_answer.clone(),
        });
    }
    for practice in &step.practice_questions {
        blocks.push(LessonContentBlock::Practice {
            id: next_block_id(step_number, blocks.len()),
            lesson_objective_id: objective_id.to_owned(),
            question: practice.question.clone(),
            expected_answer: practice.expected_answer.clone(),
            hints: practice.hints.clone(),
        });
    }
    for figure_sequence in &step.figure_sequences {
        let figure = evidence
            .figures
            .get(sequence_index(*figure_sequence).map_err(|error| {
                deterministic_fault(vec![format!("A figure selection is invalid: {error}")])
            })?)
            .ok_or_else(|| {
                deterministic_fault(vec![
                    "A requested visual is not available in the verified source material."
                        .to_owned(),
                ])
            })?;
        blocks.push(LessonContentBlock::Visual {
            id: next_block_id(step_number, blocks.len()),
            source_record_id: figure.source_record_id.clone(),
            asset_file_name: figure.asset_file_name.clone(),
            figure_sha256: figure.sha256.clone(),
            caption: figure.caption.clone(),
            alt_text: figure.alt_text.clone(),
        });
    }
    Ok(blocks)
}

fn next_block_id(step_number: usize, current_count: usize) -> String {
    format!("lesson-block-{step_number}-{}", current_count + 1)
}

fn allocate_minutes(total: u16, core_count: usize) -> Result<(u16, u16, Vec<u16>), RuntimeFault> {
    if core_count == 0 {
        return Err(deterministic_fault(vec![
            "The lesson has no core teaching step.".to_owned(),
        ]));
    }
    let edge = (total / 6).max(5);
    let core_total = total.checked_sub(edge.saturating_mul(2)).ok_or_else(|| {
        deterministic_fault(vec![
            "The lesson duration is too short for its structure.".to_owned()
        ])
    })?;
    let count = u16::try_from(core_count)
        .map_err(|_| deterministic_fault(vec!["The lesson has too many objectives.".to_owned()]))?;
    if core_total < count {
        return Err(deterministic_fault(vec![
            "The lesson duration is too short for every objective.".to_owned(),
        ]));
    }
    let base = core_total / count;
    let remainder = core_total % count;
    let durations = (0..count)
        .map(|index| base + u16::from(index < remainder))
        .collect();
    Ok((edge, edge, durations))
}

pub(super) fn validate_complete_plan(input: &Value) -> Result<Value, RuntimeFault> {
    let lesson = parse_field::<GranularLessonProgramInput>(input, "lesson")?;
    let plan = parse_field::<GranularLessonPlan>(input, "assembledLesson")?;
    let record = GranularLessonRecord {
        plan: plan.clone(),
        curriculum_snapshot: lesson.curriculum_snapshot,
        source_evidence_snapshot: lesson.source_evidence_snapshot,
        program_snapshot: LessonProgramSnapshot {
            program_id: PROGRAM_ID.to_owned(),
            program_version: PROGRAM_VERSION.to_owned(),
            program_digest: "0".repeat(64),
            program_run_id: None,
        },
    };
    record.validate_complete().map_err(deterministic_fault)?;
    encode(&plan, "validated lesson")
}

fn parse_field<T: DeserializeOwned>(value: &Value, field: &str) -> Result<T, RuntimeFault> {
    let field_value = value.get(field).ok_or_else(|| {
        deterministic_fault(vec![format!(
            "The lesson-planning input is missing {field}."
        )])
    })?;
    parse(field_value, field)
}

fn encode<T: Serialize>(value: &T, label: &str) -> Result<Value, RuntimeFault> {
    serde_json::to_value(value).map_err(|error| {
        deterministic_fault(vec![format!("The {label} could not be encoded: {error}")])
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    use crate::lesson_planning::granular::GranularLessonPlan;

    use crate::lesson_planning::program::test_support::*;
    use crate::lesson_planning::program::*;

    #[test]
    fn deterministic_core_assembly_preserves_instruction_content() {
        let (_, _, _, _, _, core) = input_and_stage_outputs();
        let expected_example = core.core_steps[1].worked_examples[0].clone();
        let (instructions, practice) = split_core_plan(core);

        let assembled = assemble_core_step_plan(&json!({
            "coreInstructionPlan": instructions,
            "corePracticePlan": practice,
        }))
        .expect("assembled core steps");
        let assembled: CoreStepPlan =
            serde_json::from_value(assembled).expect("complete core plan");

        assert_eq!(assembled.core_steps[1].worked_examples[0], expected_example);
    }

    #[test]
    fn assembles_and_validates_the_ordering_fractions_golden_lesson() {
        let (lesson, _, objectives, knowledge, assessments, core) = input_and_stage_outputs();
        let evidence = EvidencePlan {
            references: lesson
                .source_evidence_snapshot
                .records
                .iter()
                .map(|record| LessonReference {
                    record_id: record.record_id.clone(),
                    title: record.title.clone(),
                    attribution: record.attribution.clone(),
                })
                .collect(),
        };
        let assembled = assemble_lesson(&json!({
            "lesson": lesson,
            "objectivePlan": objectives,
            "knowledgePlan": knowledge,
            "assessmentPlan": assessments,
            "evidencePlan": evidence,
            "coreStepPlan": core,
        }))
        .expect("assembled lesson");
        let validated = validate_complete_plan(&json!({
            "lesson": lesson,
            "assembledLesson": assembled,
        }))
        .expect("validated lesson");
        let plan: GranularLessonPlan = serde_json::from_value(validated).expect("lesson plan");
        assert_eq!(plan.lesson_objectives.len(), 2);
        assert_eq!(plan.steps.len(), 4);
        assert_eq!(
            plan.steps
                .iter()
                .map(|step| step.duration_minutes)
                .sum::<u16>(),
            lesson.lesson_duration_minutes
        );
    }

    #[test]
    fn deterministically_completes_an_omitted_reviewed_fraction_task() {
        let (mut lesson, _, mut objectives, knowledge, assessments, _) = input_and_stage_outputs();
        objectives.lesson_objectives[1].statement =
            "Arrange fractions in ascending order.".to_owned();
        lesson.source_evidence_snapshot.records.push(
            crate::lesson_planning::granular::SourceEvidenceRecord {
                record_id: "reviewed-ordering-exercise".to_owned(),
                title: "Exercise: Order and compare fractions".to_owned(),
                excerpt: "Arrange 8/9, 11/12 and 5/6 in ascending order.".to_owned(),
                excerpt_sha256: "d".repeat(64),
                attribution: "Reviewed mathematics source".to_owned(),
            },
        );

        // The model now returns content plus the goal's position; identifiers are
        // attached afterwards, so the stage output is expressed that way here too.
        let drafted = DraftedAssessmentPlan {
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
        let completed = complete_reviewed_assessments(&json!({
            "lesson": lesson,
            "objectivePlan": objectives,
            "knowledgePlan": knowledge,
            "draftAssessmentPlan": drafted,
        }))
        .expect("completed assessment plan");
        let completed: AssessmentPlan = serde_json::from_value(completed).expect("assessment plan");
        let reviewed = completed
            .assessments
            .iter()
            .find(|assessment| {
                assessment
                    .supporting_record_ids
                    .contains(&"reviewed-ordering-exercise".to_owned())
            })
            .expect("reviewed exercise assessment");

        assert_eq!(reviewed.expected_answer, "5/6 < 8/9 < 11/12");
        assert!(reviewed.question.contains("8/9, 11/12 and 5/6"));
    }

    #[test]
    fn deterministically_uses_distinct_reviewed_exercises_for_fraction_practice() {
        let (mut lesson, _, objectives, _, mut assessments, core) = input_and_stage_outputs();
        let (instruction_plan, mut draft_practice_plan) = split_core_plan(core);
        let repeated_question = draft_practice_plan.core_steps[0].practice_questions[0].clone();
        draft_practice_plan.core_steps[1].practice_questions = vec![repeated_question];
        let reviewed_tasks = [
            (
                "reviewed-ascending-exercise",
                "Arrange 8/9, 11/12 and 5/6 in ascending order.",
                "5/6 < 8/9 < 11/12",
                objectives.lesson_objectives[0].id.clone(),
            ),
            (
                "reviewed-descending-exercise",
                "Arrange 5/8, 8/14 and 18/28 in descending order.",
                "18/28 > 5/8 > 8/14",
                objectives.lesson_objectives[1].id.clone(),
            ),
        ];
        for (index, (record_id, question, answer, objective_id)) in
            reviewed_tasks.into_iter().enumerate()
        {
            lesson.source_evidence_snapshot.records.push(
                crate::lesson_planning::granular::SourceEvidenceRecord {
                    record_id: record_id.to_owned(),
                    title: "Exercise: Order and compare fractions".to_owned(),
                    excerpt: question.to_owned(),
                    excerpt_sha256: "e".repeat(64),
                    attribution: "Reviewed mathematics source".to_owned(),
                },
            );
            assessments.assessments.push(AssessmentItem {
                id: format!("reviewed-assessment-{}", index + 1),
                lesson_objective_id: objective_id,
                knowledge_component_id: format!("knowledge-{}", index + 1),
                question: question.to_owned(),
                expected_answer: answer.to_owned(),
                bloom_level: BloomLevel::Apply,
                rubric: vec!["Orders every supplied fraction correctly.".to_owned()],
                supporting_record_ids: vec![record_id.to_owned()],
            });
        }

        let completed = complete_reviewed_practice(&json!({
            "lesson": lesson,
            "objectivePlan": objectives,
            "assessmentPlan": assessments,
            "coreInstructionPlan": instruction_plan,
            "draftCorePracticePlan": draft_practice_plan,
        }))
        .expect("completed reviewed practice");
        let completed: CorePracticePlan =
            serde_json::from_value(completed).expect("completed practice plan");

        assert_eq!(
            completed.core_steps[0].practice_questions[0].question,
            "Arrange 8/9, 11/12 and 5/6 in ascending order."
        );
        assert_eq!(
            completed.core_steps[1].practice_questions[0].question,
            "Arrange 5/8, 8/14 and 18/28 in descending order."
        );
        assert_eq!(
            completed.core_steps[1].practice_questions[0].expected_answer,
            "18/28 > 5/8 > 8/14"
        );
        assert!(completed
            .core_steps
            .iter()
            .all(|step| step.practice_questions[0].hints.len() == 3));
    }
}
